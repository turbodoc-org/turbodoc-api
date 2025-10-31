import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class CreateCodeSnippet extends OpenAPIRoute {
  static schema = {
    tags: ["Code Snippets"],
    summary: "Create a new code snippet",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1),
              code: z.string().min(1),
              language: z.string().optional().default("javascript"),
              theme: z.string().optional().default("dracula"),
              background_type: z.string().optional().default("gradient"),
              background_value: z
                .string()
                .optional()
                .default("linear-gradient(135deg, #667eea 0%, #764ba2 100%)"),
              padding: z.number().optional().default(64),
              show_line_numbers: z.boolean().optional().default(true),
              font_family: z.string().optional().default("Fira Code"),
              font_size: z.number().optional().default(14),
              window_style: z.string().optional().default("mac"),
            }),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Code snippet created successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                id: z.string(),
                user_id: z.string(),
                title: z.string(),
                code: z.string(),
                language: z.string(),
                theme: z.string(),
                background_type: z.string(),
                background_value: z.string(),
                padding: z.number(),
                show_line_numbers: z.boolean(),
                font_family: z.string(),
                font_size: z.number(),
                window_style: z.string(),
                created_at: z.string(),
                updated_at: z.string(),
              }),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    try {
      const user = c.get("user");
      const authToken = c.get("authToken");
      const supabase = supabaseApiClient(authToken, c);
      const body = await c.req.json();

      const {
        title,
        code,
        language = "javascript",
        theme = "dracula",
        background_type = "gradient",
        background_value = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding = 64,
        show_line_numbers = true,
        font_family = "Fira Code",
        font_size = 14,
        window_style = "mac",
      } = body;

      if (!title || !code) {
        throw new HTTPException(400, {
          message: "Title and code are required",
        });
      }

      const newCodeSnippet: Database["public"]["Tables"]["code_snippets"]["Insert"] =
        {
          user_id: user.id,
          title,
          code,
          language,
          theme,
          background_type,
          background_value,
          padding,
          show_line_numbers,
          font_family,
          font_size,
          window_style,
        };

      const { data, error } = await supabase
        .from("code_snippets")
        .insert(newCodeSnippet)
        .select()
        .single();

      if (error) {
        console.error("Error creating code snippet:", error);
        throw new HTTPException(500, {
          message: "Failed to create code snippet",
        });
      }

      return c.json({ data }, 201);
    } catch (error) {
      console.error("Error in CreateCodeSnippet:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
