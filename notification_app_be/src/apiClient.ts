import axios from "axios";
import { NotificationsResponse } from "./types";

export class NotificationApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  async fetchNotifications(): Promise<NotificationsResponse> {
    const response = await axios.get<NotificationsResponse>(
      `${this.baseUrl}/evaluation-service/notifications`,
      { headers: this.headers }
    );
    return response.data;
  }
}
