export interface CreateSessionBody {
  source: 'manual_start';
}

export interface EndSessionBody {
  reason: 'manual_end';
}
