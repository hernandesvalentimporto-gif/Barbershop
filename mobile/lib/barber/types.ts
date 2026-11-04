export type BarberRole = "client" | "barber" | "admin";
export type UserStatus = "active" | "inactive" | string;

export type BarberUser = {
  id: number;
  name: string;
  email: string;
  role: BarberRole;
  status: UserStatus;
};

export type Service = {
  id: number;
  name: string;
  duration_minutes: number;
  price_cents: number;
  active?: number | boolean;
  description?: string | null;
};

export type Catalog = {
  services: Service[];
  barbers: Array<{ id: number; name: string }>;
};

export type AvailabilitySlot = {
  starts_at: string;
  ends_at: string;
};

export type Appointment = {
  id: number;
  client_id?: number;
  barber_id?: number;
  service_id?: number;
  client_name?: string;
  barber_name?: string;
  service_name?: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes?: string | null;
  price_cents?: number;
};

export type ClientHistoryAppointment = Pick<
  Appointment,
  "id" | "starts_at" | "ends_at" | "status" | "barber_name" | "service_name"
>;

export type ClientSummary = {
  upcoming?: Appointment | null;
  [key: string]: unknown;
};

export type BarberSummary = {
  today_appointments?: Appointment[];
  appointments?: Appointment[];
  [key: string]: unknown;
};

export type AdminSummary = {
  users?: number | { clients?: number; total?: number };
  barbers?: number | { total?: number };
  appointments?: number | Appointment[];
  [key: string]: unknown;
};

export type SummaryResponse = {
  data: ClientSummary | BarberSummary | AdminSummary;
};

export type UserListResponse = { users: BarberUser[] };
export type ServiceListResponse = { services: Service[] };
export type AppointmentListResponse = { appointments: Appointment[] };

export type SaveUserInput = {
  id?: number;
  name: string;
  email: string;
  role: "client" | "barber";
  status: "active" | "inactive";
  password?: string;
};

export type SaveServiceInput = {
  id?: number;
  name: string;
  duration_minutes: number;
  price_cents: number;
  active: 0 | 1;
  description?: string;
};
