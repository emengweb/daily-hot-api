export type HotListItem = {
  id: string | number;
  title: string;
  desc?: string;
  pic?: string;
  hot?: number | string;
  tip?: string;
  url: string;
  mobileUrl: string;
  label?: string;
  author?: string;
  type?: string;
  score?: number;
  source?: string;
  [key: string]: unknown;
};
