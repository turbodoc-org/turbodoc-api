import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";

export class GetOgImage extends OpenAPIRoute {
  static schema = {
    tags: ["Bookmarks"],
    summary: "Get Open Graph image for a URL",
    request: {
      query: z.object({
        url: z
          .string()
          .url("Must be a valid URL")
          .describe("The URL to fetch Open Graph image for"),
      }),
    },
    responses: {
      "200": {
        description: "Open Graph image URL retrieved successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                ogImage: z
                  .string()
                  .nullable()
                  .describe("Open Graph image URL or null if not found"),
                title: z
                  .string()
                  .nullable()
                  .describe("Open Graph title or null if not found"),
              })
              .describe("Open Graph data"),
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: z.object({
              status: z.number(),
              message: z.string(),
            }),
          },
        },
      },
      "401": {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: z.object({
              status: z.number(),
              message: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    try {
      const { url } = c.req.query();

      if (!url) {
        throw new HTTPException(400, { message: "URL parameter is required" });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        throw new HTTPException(400, { message: "Invalid URL format" });
      }

      // Fetch the webpage
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TurbodocBot/1.0)",
        },
        // Set a timeout
        signal: AbortSignal.timeout(10000), // 10 seconds
      });

      if (!response.ok) {
        return c.json({ ogImage: null, title: null });
      }

      const html = await response.text();

      // Extract Open Graph image
      let ogImage: string | null = null;
      const ogImageMatch = html.match(
        /<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\'][^>]*>/i,
      );
      if (ogImageMatch && ogImageMatch[1]) {
        ogImage = ogImageMatch[1];

        // Handle relative URLs
        if (ogImage.startsWith("/")) {
          const urlObj = new URL(url);
          ogImage = `${urlObj.protocol}//${urlObj.host}${ogImage}`;
        } else if (ogImage.startsWith("//")) {
          const urlObj = new URL(url);
          ogImage = `${urlObj.protocol}${ogImage}`;
        }
      }

      // Extract Open Graph title as fallback
      let title: string | null = null;
      const ogTitleMatch = html.match(
        /<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)["\'][^>]*>/i,
      );
      if (ogTitleMatch && ogTitleMatch[1]) {
        title = ogTitleMatch[1];
      } else {
        // Fallback to page title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim();
        }
      }

      return c.json({ ogImage, title });
    } catch (error) {
      console.error("Error fetching OG image:", error);

      if (error instanceof HTTPException) {
        throw error;
      }

      // Return null values instead of throwing error for external fetch failures
      return c.json({ ogImage: null, title: null });
    }
  }
}
