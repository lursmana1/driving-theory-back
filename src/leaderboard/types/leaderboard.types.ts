export interface LeaderboardEntry {
  userId: number;
  place: number;
  name: string;
  surname: string | null;
  score: number;
}

export interface LeaderboardResponse {
  startDate: string;
  endDate: string;
  data: LeaderboardEntry[];
  currentUser: {
    userId: number;
    place: number | null;
    name: string;
    surname: string | null;
    score: number;
  };
  total: number;
  page: number;
  totalPages: number;
}
