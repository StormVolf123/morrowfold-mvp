export type Kind = "area" | "task" | "memory" | "draft" | "conversation";
export type Item = {
  id: string;
  kind: Kind;
  version: number;
  data: Record<string, any>;
};
export type Config = { apiUrl: string; mode: "preview" | "live" };
const today = new Date().toLocaleDateString("en-CA");
export const seed: Item[] = [
  {
    id: "career",
    kind: "area",
    version: 1,
    data: {
      title: "A more meaningful career",
      goal: "Find a role where curiosity meets impact.",
      theme: "forest",
    },
  },
  {
    id: "run",
    kind: "area",
    version: 1,
    data: {
      title: "My first marathon",
      goal: "Build consistency. Enjoy the miles.",
      theme: "clay",
    },
  },
  {
    id: "learn",
    kind: "area",
    version: 1,
    data: {
      title: "Make room to learn",
      goal: "A little more reading, a little less scrolling.",
      theme: "blue",
    },
  },
  {
    id: "t1",
    kind: "task",
    version: 1,
    data: {
      title: "Shape my next application",
      area_id: "career",
      done: false,
      due: today,
    },
  },
  {
    id: "t2",
    kind: "task",
    version: 1,
    data: {
      title: "An easy 5 km, at my own pace",
      area_id: "run",
      done: false,
      due: today,
    },
  },
  {
    id: "t3",
    kind: "task",
    version: 1,
    data: {
      title: "Twenty quiet minutes with a book",
      area_id: "learn",
      done: false,
      due: today,
    },
  },
  {
    id: "m1",
    kind: "memory",
    version: 1,
    data: {
      title: "How I like to work",
      content: "I value autonomy, thoughtful colleagues, and time to go deep.",
      area_id: "career",
    },
  },
];
