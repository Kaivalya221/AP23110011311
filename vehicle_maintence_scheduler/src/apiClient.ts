import axios from "axios";
import { DepotsResponse, VehiclesResponse } from "./types";

export class ApiClient {
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

  async fetchDepots(): Promise<DepotsResponse> {
    const response = await axios.get<DepotsResponse>(
      `${this.baseUrl}/evaluation-service/depots`,
      { headers: this.headers }
    );
    return response.data;
  }

  async fetchVehicles(): Promise<VehiclesResponse> {
    const response = await axios.get<VehiclesResponse>(
      `${this.baseUrl}/evaluation-service/vehicles`,
      { headers: this.headers }
    );
    return response.data;
  }
}
