import {
  Controller,
  DynamicModule,
  Get,
  Inject,
  Injectable,
  ModuleMetadata,
  Module,
  Optional,
  Provider,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

export interface ServiceMetadata {
  serviceName: string;
  version: string;
}

export interface ReadinessCheck {
  name: string;
  status: 'up' | 'down';
  details?: Record<string, unknown>;
}

export interface ReadinessProbe {
  check(): Promise<ReadinessCheck[]>;
}

export const SERVICE_METADATA = Symbol('SERVICE_METADATA');
export const READINESS_PROBE = Symbol('READINESS_PROBE');

@Injectable()
class AlwaysReadyProbe implements ReadinessProbe {
  // Reports the process as ready when no service-specific probe is provided.
  async check(): Promise<ReadinessCheck[]> {
    return [{ name: 'process', status: 'up' }];
  }
}

@Injectable()
class HealthService {
  // Stores service metadata and the optional readiness probe.
  constructor(
    @Inject(SERVICE_METADATA) private readonly metadata: ServiceMetadata,
    @Optional() @Inject(READINESS_PROBE) private readonly readinessProbe?: ReadinessProbe,
  ) {}

  // Builds the liveness response for this service process.
  live() {
    return {
      status: 'ok',
      service: this.metadata.serviceName,
      version: this.metadata.version,
      timestamp: new Date().toISOString(),
    };
  }

  // Builds the readiness response and throws when any check is down.
  async ready() {
    const checks = (await this.readinessProbe?.check()) ?? [];
    const failed = checks.filter((check) => check.status === 'down');
    const payload = {
      status: failed.length === 0 ? 'ready' : 'not_ready',
      service: this.metadata.serviceName,
      version: this.metadata.version,
      checks,
      timestamp: new Date().toISOString(),
    };

    if (failed.length > 0) {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}

@Controller('health')
class HealthController {
  // Wires health endpoints to the health service.
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  // Returns the liveness endpoint payload.
  getLive() {
    return this.healthService.live();
  }

  @Get('ready')
  // Returns the readiness endpoint payload.
  async getReady() {
    return this.healthService.ready();
  }
}

@Module({})
export class ServicePlatformModule {
  // Registers shared config, health endpoints, metadata, and readiness providers.
  static register(options: {
    serviceName: string;
    version?: string;
    imports?: ModuleMetadata['imports'];
    readinessProbeProvider?: Provider;
  }): DynamicModule {
    return {
      module: ServicePlatformModule,
      imports: [
        ...(options.imports ?? []),
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          ignoreEnvFile: true,
        }),
      ],
      controllers: [HealthController],
      providers: [
        {
          provide: SERVICE_METADATA,
          useValue: {
            serviceName: options.serviceName,
            version: options.version ?? '0.1.0',
          } satisfies ServiceMetadata,
        },
        options.readinessProbeProvider ?? {
          provide: READINESS_PROBE,
          useClass: AlwaysReadyProbe,
        },
        HealthService,
      ],
      exports: [SERVICE_METADATA, READINESS_PROBE],
    };
  }
}
