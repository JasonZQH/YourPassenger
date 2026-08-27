import { Injectable } from '@nestjs/common';

import type { UpdateProfileBody, UserProfile } from '@yourpassenger/contracts';
import type { UserProfile as UserProfileRecord } from '../generated/prisma';

import { ProfilePrismaService } from './profile.prisma.service';

@Injectable()
export class ProfileRepository {
  // Stores the Prisma client used for profile persistence.
  constructor(private readonly prisma: ProfilePrismaService) {}

  // Loads a persisted profile and maps it to the shared contract.
  async getProfile(userId: string): Promise<UserProfile | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      return null;
    }

    return this.toContract(profile);
  }

  // Creates or updates the user's profile record from contract fields.
  async saveProfile(userId: string, body: UpdateProfileBody): Promise<UserProfile> {
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        nickname: body.nickname,
        interests: [...body.interests],
        ageRange: body.ageRange,
        gender: body.gender,
        occupationCategory: body.occupationCategory,
        hobbyTags: [...body.hobbyTags],
        preferredLanguage: body.preferredLanguage,
        conversationStyle: body.conversationStyle,
        responseLength: body.responseLength,
        proactiveTopicPushing: body.proactiveTopicPushing,
        avoidTopicTags: [...body.avoidTopicTags],
      },
      create: {
        userId,
        nickname: body.nickname,
        interests: [...body.interests],
        ageRange: body.ageRange,
        gender: body.gender,
        occupationCategory: body.occupationCategory,
        hobbyTags: [...body.hobbyTags],
        preferredLanguage: body.preferredLanguage,
        conversationStyle: body.conversationStyle,
        responseLength: body.responseLength,
        proactiveTopicPushing: body.proactiveTopicPushing,
        avoidTopicTags: [...body.avoidTopicTags],
      },
    });

    return this.toContract(profile);
  }

  // Checks whether a profile record exists for the user.
  async getProfileCompletion(userId: string): Promise<boolean> {
    const count = await this.prisma.userProfile.count({
      where: { userId },
      take: 1,
    });
    return count > 0;
  }

  // Converts a Prisma profile record into the public profile contract.
  private toContract(profile: UserProfileRecord): UserProfile {
    return {
      userId: profile.userId,
      nickname: profile.nickname,
      interests: profile.interests as UserProfile['interests'],
      ageRange: profile.ageRange as UserProfile['ageRange'],
      gender: profile.gender as UserProfile['gender'],
      occupationCategory: profile.occupationCategory as UserProfile['occupationCategory'],
      hobbyTags: profile.hobbyTags as UserProfile['hobbyTags'],
      preferredLanguage: profile.preferredLanguage,
      conversationStyle: profile.conversationStyle as UserProfile['conversationStyle'],
      responseLength: profile.responseLength as UserProfile['responseLength'],
      proactiveTopicPushing: profile.proactiveTopicPushing,
      avoidTopicTags: profile.avoidTopicTags as UserProfile['avoidTopicTags'],
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}
