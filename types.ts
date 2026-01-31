
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';

export interface BloodBank {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contact_number: string;
  units_available: number;
  distance_km: number;
  eta_minutes: number;
  google_maps_url: string;
}

export interface SearchResponse {
  results: BloodBank[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}
