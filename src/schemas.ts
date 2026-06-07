import { z } from "zod";

export const TopStoriesInput = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("How many top stories to return (1–50). Defaults to 10."),
};

export const GetStoryInput = {
  id: z.number().int().positive().describe("Hacker News item id."),
};

export const SearchInput = {
  query: z.string().min(1).max(200).describe("Full-text search query."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Max results (1–20). Defaults to 5."),
};
