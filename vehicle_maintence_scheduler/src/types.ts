export interface Depot {
  ID: number;
  MechanicHours: number;
}

export interface Vehicle {
  TaskID: string;
  Duration: number;
  Impact: number;
}

export interface ScheduleResult {
  depotId: number;
  mechanicHoursBudget: number;
  selectedTasks: Vehicle[];
  totalDuration: number;
  totalImpact: number;
}

export interface DepotsResponse {
  depots: Depot[];
}

export interface VehiclesResponse {
  vehicles: Vehicle[];
}
