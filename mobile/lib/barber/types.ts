export type BarberRole = "client" | "barber" | "admin";
export type UserStatus = "active" | "inactive" | string;
export type WorkDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type WorkDay = { enabled: boolean; start: string; end: string };
export type WorkSchedule = Record<WorkDayKey, WorkDay>;

export type BarberUser = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: BarberRole;
  status: UserStatus;
  platform_admin?: boolean;
  barbershop_id?: number | null;
  work_schedule?: WorkSchedule | null;
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
  email?: string;
  phone?: string;
  role: "client" | "barber";
  status: "active" | "inactive";
  password?: string;
  work_schedule?: WorkSchedule;
};

export type SaveServiceInput = {
  id?: number;
  name: string;
  duration_minutes: number;
  price_cents: number;
  active: 0 | 1;
  description?: string;
};

export type MasterShop = {
  id: number; name: string; monthly_amount_cents: number; payment_status: "paid" | "pending"; due_date: string; paid_at?: string | null; clients_count: number; barbers_count: number;
};
export type MasterDashboardResponse = { shops: MasterShop[]; plan_monthly_cents: number; totals: { shops: number; paid: number; pending: number } };
