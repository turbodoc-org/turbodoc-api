import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

const NoteOperationSchema = z.object({
  operation: z
    .enum(["create", "update", "delete"])
    .describe("Type of operation to perform"),
  id: z
    .string()
    .optional()
    .describe("UUID of the note (required for update/delete)"),
  title: z.string().optional().describe("Title of the note"),
  content: z.string().optional().describe("Content of the note"),
  tags: z.string().optional().describe("Comma-separated tags"),
  is_favorite: z.boolean().optional().describe("Whether the note is favorite"),
  version: z
    .number()
    .optional()
    .describe("Current version number for optimistic locking"),
});

const BatchResultSchema = z.object({
  success: z.boolean().describe("Whether the operation succeeded"),
  operation: z.enum(["create", "update", "delete"]),
  id: z.string().optional().describe("Note ID"),
  error: z.string().optional().describe("Error message if failed"),
  data: z
    .object({
      id: z.string(),
      user_id: z.string(),
      title: z.string(),
      content: z.string(),
      tags: z.string().nullable(),
      is_favorite: z.boolean(),
      version: z.number(),
      created_at: z.string().nullable(),
      updated_at: z.string().nullable(),
    })
    .optional()
    .describe("Created/updated note data"),
});

export class BatchNotes extends OpenAPIRoute {
  static schema = {
    tags: ["Notes"],
    summary: "Batch operations on notes",
    description:
      "Process multiple create, update, and delete operations in a single request. Operations are processed sequentially, and results are returned for each operation.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                operations: z
                  .array(NoteOperationSchema)
                  .min(1)
                  .max(100)
                  .describe("Array of operations to perform (max 100)"),
              })
              .describe("Batch operations request"),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Batch operations completed",
        content: {
          "application/json": {
            schema: z
              .object({
                results: z
                  .array(BatchResultSchema)
                  .describe("Results for each operation"),
                summary: z.object({
                  total: z.number().describe("Total operations requested"),
                  successful: z
                    .number()
                    .describe("Number of successful operations"),
                  failed: z.number().describe("Number of failed operations"),
                }),
              })
              .describe("Batch operation results"),
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
      const user = c.get("user");
      const authToken = c.get("authToken");

      const { operations } = await c.req.json();

      const supabase = supabaseApiClient(authToken, c);
      const results: z.infer<typeof BatchResultSchema>[] = [];

      // Process operations sequentially
      for (const op of operations) {
        try {
          switch (op.operation) {
            case "create": {
              const insertData: Database["public"]["Tables"]["notes"]["Insert"] =
                {
                  user_id: user.id,
                  title: op.title || "",
                  content: op.content || "",
                  tags: op.tags || null,
                  is_favorite: op.is_favorite || false,
                };

              const { data, error } = await supabase
                .from("notes")
                .insert(insertData)
                .select()
                .single();

              if (error) throw error;

              results.push({
                success: true,
                operation: "create",
                id: data.id,
                data: data as any,
              });
              break;
            }

            case "update": {
              if (!op.id) {
                results.push({
                  success: false,
                  operation: "update",
                  error: "Note ID is required for update operation",
                });
                continue;
              }

              const updateData: Database["public"]["Tables"]["notes"]["Update"] =
                {};

              if (op.title !== undefined) updateData.title = op.title;
              if (op.content !== undefined) updateData.content = op.content;
              if (op.tags !== undefined) updateData.tags = op.tags;
              if (op.is_favorite !== undefined)
                updateData.is_favorite = op.is_favorite;

              // Build query with version check if provided
              let query = supabase
                .from("notes")
                .update(updateData)
                .eq("id", op.id)
                .eq("user_id", user.id);

              if (op.version !== undefined) {
                query = query.eq("version", op.version);
              }

              const { data, error } = await query.select().single();

              if (error) {
                if (error.code === "PGRST116") {
                  // No rows returned - version conflict
                  results.push({
                    success: false,
                    operation: "update",
                    id: op.id,
                    error:
                      "Version conflict - note was modified by another client",
                  });
                  continue;
                }
                throw error;
              }

              results.push({
                success: true,
                operation: "update",
                id: data.id,
                data: data as any,
              });
              break;
            }

            case "delete": {
              if (!op.id) {
                results.push({
                  success: false,
                  operation: "delete",
                  error: "Note ID is required for delete operation",
                });
                continue;
              }

              const { error } = await supabase
                .from("notes")
                .delete()
                .eq("id", op.id)
                .eq("user_id", user.id);

              if (error) throw error;

              results.push({
                success: true,
                operation: "delete",
                id: op.id,
              });
              break;
            }
          }
        } catch (error) {
          results.push({
            success: false,
            operation: op.operation,
            id: op.id,
            error:
              error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
      }

      const summary = {
        total: operations.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      };

      return c.json({
        results,
        summary,
      });
    } catch (error) {
      console.error("Batch notes error:", error);

      if (error instanceof HTTPException) {
        throw error;
      }

      throw new HTTPException(500, {
        message: "Internal server error",
      });
    }
  }
}
