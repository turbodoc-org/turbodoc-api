import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class UpdateCodeSnippet extends OpenAPIRoute {
  static schema = {
    tags: ["Code Snippets"],
    summary: "Update a code snippet",
    request: {
      params: z.object({
        id: z.string().uuid().describe("The ID of the code snippet to update"),
      }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                title: z
                  .string()
                  .min(1)
                  .optional()
                  .describe("Title of the code snippet"),
                code: z.string().min(1).optional().describe("The code content"),
                language: z
                  .string()
                  .optional()
                  .describe("Programming language of the code"),
                theme: z
                  .string()
                  .optional()
                  .describe("Theme for syntax highlighting"),
                background_type: z
                  .string()
                  .optional()
                  .describe("Type of background (gradient, solid, image)"),
                background_value: z
                  .string()
                  .optional()
                  .describe("CSS value for the background"),
                padding: z
                  .number()
                  .optional()
                  .describe("Padding around the code"),
                show_line_numbers: z
                  .boolean()
                  .optional()
                  .describe("Whether to show line numbers"),
                font_family: z
                  .string()
                  .optional()
                  .describe("Font family for the code"),
                font_size: z
                  .number()
                  .optional()
                  .describe("Font size in pixels"),
                window_style: z
                  .string()
                  .optional()
                  .describe("Window style (mac, windows, none)"),
              })
              .describe("Code snippet update request"),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Code snippet updated successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z
                .object({
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
                  created_at: z.string().nullable(),
                  updated_at: z.string().nullable(),
                })
                .describe("Updated code snippet object"),
            }),
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
      "404": {
        description: "Code snippet not found",
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
      const user = c.get("user");
      const authToken = c.get("authToken");
      const supabase = supabaseApiClient(authToken, c);
      const { id } = c.req.param();
      const body = await c.req.json();

      if (!id) {
        throw new HTTPException(400, {
          message: "Code snippet ID is required",
        });
      }

      // Check if snippet exists and belongs to user
      const { data: existingSnippet, error: fetchError } = await supabase
        .from("code_snippets")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (fetchError || !existingSnippet) {
        throw new HTTPException(404, { message: "Code snippet not found" });
      }

      // Build update object with only provided fields
      const updateData: Database["public"]["Tables"]["code_snippets"]["Update"] =
        {};

      if (body.title !== undefined) updateData.title = body.title;
      if (body.code !== undefined) updateData.code = body.code;
      if (body.language !== undefined) updateData.language = body.language;
      if (body.theme !== undefined) updateData.theme = body.theme;
      if (body.background_type !== undefined)
        updateData.background_type = body.background_type;
      if (body.background_value !== undefined)
        updateData.background_value = body.background_value;
      if (body.padding !== undefined) updateData.padding = body.padding;
      if (body.show_line_numbers !== undefined)
        updateData.show_line_numbers = body.show_line_numbers;
      if (body.font_family !== undefined)
        updateData.font_family = body.font_family;
      if (body.font_size !== undefined) updateData.font_size = body.font_size;
      if (body.window_style !== undefined)
        updateData.window_style = body.window_style;

      const { data, error } = await supabase
        .from("code_snippets")
        .update(updateData)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating code snippet:", error);
        throw new HTTPException(500, {
          message: "Failed to update code snippet",
        });
      }

      return c.json({ data }, 200);
    } catch (error) {
      console.error("Error in UpdateCodeSnippet:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
