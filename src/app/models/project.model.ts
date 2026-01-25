export interface Project {
  id?: number;
  name: string;
  domain?: string | null;
  owner?: string | null;
  description?: string | null;
  status: string;
  currentStep?: number | null;
  createdAt?: string;
  updatedAt?: string;
}
