import OpenAI from "openai";

export const TYPHOON_DEFAULT_BASE_URL = "https://api.opentyphoon.ai/v1";
export const TYPHOON_DEFAULT_TEXT_MODEL = "typhoon-v2.5-30b-a3b-instruct";
export const TYPHOON_DEFAULT_OCR_MODEL = "typhoon-ocr-v2";

export interface TyphoonConfig {
  apiKey: string | null;
  baseURL: string;
  textModel: string;
  ocrModel: string;
}

export function getTyphoonConfig(): TyphoonConfig {
  const apiKey = process.env.TYPHOON_API_KEY?.trim() || null;
  const baseURL =
    process.env.TYPHOON_BASE_URL?.trim() || TYPHOON_DEFAULT_BASE_URL;
  const textModel =
    process.env.TYPHOON_TEXT_MODEL?.trim() || TYPHOON_DEFAULT_TEXT_MODEL;
  const ocrModel =
    process.env.TYPHOON_OCR_MODEL?.trim() || TYPHOON_DEFAULT_OCR_MODEL;

  return {
    apiKey,
    baseURL,
    textModel,
    ocrModel,
  };
}

export function isTyphoonConfigured(): boolean {
  const { apiKey } = getTyphoonConfig();
  return Boolean(apiKey && apiKey !== "your-opentyphoon-api-key");
}

export function createTyphoonClient(): OpenAI {
  const config = getTyphoonConfig();
  if (!config.apiKey) {
    throw new Error(
      "ไม่พบการตั้งค่าบริการวิเคราะห์อัตโนมัติ กรุณาตรวจสอบการตั้งค่าระบบ",
    );
  }

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: 45_000,
    maxRetries: 1,
  });
}
