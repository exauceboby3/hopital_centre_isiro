export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CASHIER'
  | 'RECEPTIONIST'
  | 'SECRETARY'
  | 'DOCTOR'
  | 'NURSE'
  | 'LAB_TECHNICIAN'
  | 'MEDICAL_BIOLOGIST'
  | 'RADIOLOGIST'
  | 'SURGEON'
  | 'MIDWIFE'
  | 'PHARMACIST'
  | 'ACCOUNTANT'
  | 'STOREKEEPER';

export interface User {
  id: string;
  username: string;
  role: Role;
  additionalRoles?: Role[];
  isActive: boolean;
  lastActiveAt?: string;
}

export interface Patient {
  id: string;
  medicalRecordNumber: string;
  lastName: string;
  postName?: string | null;
  firstName?: string | null;
  sex: 'MALE' | 'FEMALE';
  dateOfBirth?: string;
  bloodType?: string | null;
  address?: string | null;
  phone?: string | null;
  emergencyContact?: string | null;
  customFields?: Array<{ definition: CustomFieldDefinition; value: unknown }>;
  createdAt: string;
}

export interface CustomFieldDefinition {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';
  placeholder?: string;
  helpText?: string;
  required: boolean;
  options?: string[];
  displayOrder: number;
  isActive: boolean;
}
