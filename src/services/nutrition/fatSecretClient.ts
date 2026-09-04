import { logger } from "../../utils/logger.js";
import type { NutritionLookupResult } from "../../types/nutrition.js";

const TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
const API_URL = "https://platform.fatsecret.com/rest/server.api";

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface FoodSearchResult {
  foods?: {
    food?: Array<{ food_id: string; food_name: string }>;
  };
}

interface FoodGetResult {
  food?: {
    food_name: string;
    servings: {
      serving: Array<{
        metric_serving_amount?: string;
        metric_serving_unit?: string;
        serving_description?: string;
        calories: string;
        protein: string;
        fat: string;
        carbohydrate: string;
      }>;
    };
  };
}

/**
 * Secondary источник нутриентов (используется, если продукт не найден в USDA).
 * Требует OAuth2 client-credentials авторизацию.
 */
export class FatSecretClient {
  private accessToken: string | undefined;
  private tokenExpiresAt = 0;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private get isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.isConfigured) return null;
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "basic" }),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "FatSecret OAuth token request failed");
      return null;
    }

    const token = (await response.json()) as TokenResponse;
    this.accessToken = token.access_token;
    this.tokenExpiresAt = Date.now() + (token.expires_in - 60) * 1000;
    return this.accessToken;
  }

  async searchFood(query: string): Promise<NutritionLookupResult | null> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      logger.warn("FatSecret is not configured, skipping fallback lookup");
      return null;
    }

    const searchUrl = new URL(API_URL);
    searchUrl.searchParams.set("method", "foods.search");
    searchUrl.searchParams.set("search_expression", query);
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("max_results", "1");

    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!searchResponse.ok) {
      logger.error({ status: searchResponse.status, query }, "FatSecret search failed");
      return null;
    }
    const searchData = (await searchResponse.json()) as FoodSearchResult;
    const food = searchData.foods?.food?.[0];
    if (!food) return null;

    const getUrl = new URL(API_URL);
    getUrl.searchParams.set("method", "food.get.v2");
    getUrl.searchParams.set("food_id", food.food_id);
    getUrl.searchParams.set("format", "json");

    const getResponse = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!getResponse.ok) {
      logger.error({ status: getResponse.status, foodId: food.food_id }, "FatSecret food.get failed");
      return null;
    }
    const getData = (await getResponse.json()) as FoodGetResult;
    const servings = getData.food?.servings.serving;
    if (!servings || servings.length === 0) return null;

    // Ищем сервинг, максимально близкий к 100г (некоторые продукты не имеют ровно 100г сервинга).
    const per100 =
      servings.find((s) => s.metric_serving_unit === "g" && Number(s.metric_serving_amount) === 100) ??
      servings[0];
    if (!per100) return null;

    const metricAmount = Number(per100.metric_serving_amount ?? 100) || 100;
    const factor = 100 / metricAmount;

    return {
      matchedName: getData.food?.food_name ?? food.food_name,
      per100g: {
        calories: Number(per100.calories) * factor,
        proteinG: Number(per100.protein) * factor,
        fatG: Number(per100.fat) * factor,
        carbsG: Number(per100.carbohydrate) * factor,
      },
      source: "FATSECRET",
      isEstimated: false,
    };
  }
}
