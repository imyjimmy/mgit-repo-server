export interface ProviderProfile {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  nostrPubkey: string;
  
  // Profile information
  profilePicture?: string;
  medicalLicense?: string;
  licenseCountry?: string;
  onlineConsultationCost?: number;
  onlineConsultationCurrency?: string;
  consultationPlatforms?: string[]; // ['Zoom', 'Facetime', 'WhatsApp']
  languages?: string[]; // ['Spanish', 'English', 'French']
  yearsOfExperience?: number;
  
  // Address information
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  
  // Business hours (stored as JSON string)
  businessHours?: {
    [key: string]: { // 'Monday', 'Tuesday', etc.
      start: string; // '08:00'
      end: string;   // '20:00'
      closed?: boolean;
    };
  };
  timezone?: string;
  
  // Education & Certifications
  postgraduateEducation?: string[];
  specialtyCourses?: string[];
  certificates?: string[]; // URLs to certificate images
  
  // Additional info
  bio?: string;
  specialties?: string[];
  
  createdAt?: string;
  updatedAt?: string;
}