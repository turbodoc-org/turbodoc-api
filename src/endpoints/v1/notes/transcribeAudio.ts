import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Buffer } from "node:buffer";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

/**
 * Transcribes an audio recording with Cloudflare Workers AI Whisper Large V3
 * Turbo. The model detects the language and returns text in that language.
 *
 * The iOS client uploads the recording as multipart/form-data with a single
 * `audio` field containing the audio file. The endpoint explicitly uses the
 * transcribe task, never translate, preserving the original spoken language.
 */
export class TranscribeAudio extends OpenAPIRoute {
  static schema = {
    tags: ["Notes"],
    summary: "Transcribe audio to text (multilingual, no translation)",
    request: {
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              audio: z.string().describe("Audio recording (m4a/mp3/wav)."),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Audio transcribed successfully",
        content: {
          "application/json": {
            schema: z.object({
              text: z.string().describe("Transcribed text in the spoken language"),
            }),
          },
        },
      },
      "400": {
        description: "Bad request (missing or invalid audio)",
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
      "413": {
        description: "Audio recording is too large",
        content: {
          "application/json": {
            schema: z.object({
              status: z.number(),
              message: z.string(),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error (transcription failed)",
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
      // Ensure the user is authenticated (requireAuth has already validated the
      // JWT and set `user` before this handler runs, but double-check the AI
      // binding is available on this environment).
      if (!c.env.AI) {
        throw new HTTPException(500, {
          message: "AI binding is not configured for this environment.",
        });
      }

      // Parse the multipart upload. chanfana's OpenAPIRoute does not auto-pull
      // binary multipart bodies into the parsed `c.req.body()`, so use Hono's
      // raw body parser.
      let audioFile: File | null = null;
      try {
        const parsed = await c.req.parseBody();
        const candidate = parsed["audio"];
        if (candidate instanceof File) {
          audioFile = candidate;
        }
      } catch (err) {
        console.error({ event: "transcribe_parse_error", message: (err as Error).message });
      }

      if (!audioFile) {
        throw new HTTPException(400, {
          message: "Missing audio file. Send a multipart/form-data request with an 'audio' field.",
        });
      }

      if (audioFile.size > MAX_AUDIO_BYTES) {
        throw new HTTPException(413, {
          message: "Audio file is too large. Recordings must be smaller than 12 MB.",
        });
      }

      const audioBuffer = await audioFile.arrayBuffer();
      if (audioBuffer.byteLength === 0) {
        throw new HTTPException(400, { message: "Audio file is empty." });
      }

      // Omitting `language` makes Whisper detect it from the recording.
      // `task: "transcribe"` preserves that language instead of translating.
      const result = await c.env.AI.run("@cf/openai/whisper-large-v3-turbo", {
        audio: Buffer.from(audioBuffer).toString("base64"),
        task: "transcribe",
        vad_filter: true,
      });

      const text = (result?.text ?? "").trim();

      return c.json({ text });
    } catch (error) {
      console.error({ event: "transcribe_error", message: (error as Error).message });
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Failed to transcribe audio." });
    }
  }
}
