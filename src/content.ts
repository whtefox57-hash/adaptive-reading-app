import type { Preferences } from '../server/types';
export type User = {
  id: string;
  email: string | null;
  kind: string;
  admin: boolean;
  modelConnected?: boolean;
  preferences: Preferences;
};
export type Page =
  | 'Today'
  | 'Library'
  | 'Journeys'
  | 'Schedule'
  | 'Notebook'
  | 'Preferences'
  | 'Admin';
export const topics = [
  'Learning',
  'Biography',
  'Craft',
  'Community',
  'Career',
  'Industry',
  'Organizations',
  'Strategy',
  'History',
  'Ambition',
];
export const journeys = [
  {
    id: 'career',
    title: 'The making of a career',
    subtitle: 'Learning, opportunity, and the people who open doors',
    number: '01',
    books: 'Franklin & Carnegie',
  },
  {
    id: 'organizations',
    title: 'Ideas become institutions',
    subtitle: 'From a circle of friends to an industrial organization',
    number: '02',
    books: 'Franklin & Carnegie',
  },
  {
    id: 'judgment',
    title: 'Ambition & its limits',
    subtitle: 'Read the distance between intention and consequence',
    number: '03',
    books: 'Franklin & Bourrienne',
  },
];
