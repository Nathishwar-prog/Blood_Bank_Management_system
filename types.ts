
export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';

export interface Review {
  id: string;
  user_name: string;
  rating: number;
  comment: string;
  date: string;
}

export interface BloodBank {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contact_number: string;
  units_available: number; // Primary requested blood type units
  inventory: Record<BloodType, number>; // All blood types units
  distance_km: number;
  eta_minutes: number;
  google_maps_url: string;
  rating: number;
  review_count: number;
  reviews: Review[];
}

export interface SearchResponse {
  results: BloodBank[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface HealthInsight {
  title: string;
  category: 'Post-Donation' | 'Nutrition' | 'Conditions' | 'General';
  content: string;
  tips: string[];
  disclaimer: string;
}
