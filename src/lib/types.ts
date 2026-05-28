export interface AuthConfig {
  app_id: string;
  app_secret: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  user_id?: string;
}

export interface PathsConfig {
  drafts: string;
  archive: string;
}

export interface SettingsConfig {
  archive_after_publish: boolean;
  default_limit: number;
}

export interface Config {
  auth: AuthConfig;
  paths: PathsConfig;
  settings: SettingsConfig;
}

export interface MediaItem {
  url: string;
  alt?: string;
  type?: "IMAGE" | "VIDEO";
}

export interface PostExtras {
  topicTag?: string;
  linkAttachment?: string;
  gif?: { id: string; provider?: string };
}

export interface DraftFrontmatter {
  title?: string;
  image?: string;
  alt?: string;
  video?: string;
  images?: MediaItem[];
  link?: string;
  gif?: string;
  topic?: string;
  created?: string;
}

export interface Draft {
  frontmatter: DraftFrontmatter;
  content: string;
  filePath: string;
}

export interface PostMetrics {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  shares: number;
  clicks: number;
}

export interface ThreadsPost {
  id: string;
  text: string;
  created_at: string;
  url: string;
  media_type?: string;
  media_url?: string;
  metrics?: PostMetrics;
}

export interface ThreadsProfile {
  id: string;
  username: string;
  name?: string;
  bio?: string;
  followers_count?: number | null;
  following_count?: number;
  threads_profile_picture_url?: string;
}

export interface ThreadsInsights extends ThreadsProfile {
  demographics?: {
    countries?: Record<string, number>;
    cities?: Record<string, number>;
    age?: Record<string, number>;
    gender?: Record<string, number>;
  };
}

export interface ThreadPost {
  content: string;
  images?: MediaItem[];
}
