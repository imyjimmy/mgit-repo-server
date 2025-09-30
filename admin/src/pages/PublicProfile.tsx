import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { profileService } from '@/services/profile';
import { ProviderProfile } from '@/types/profile';

export const PublicProfile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (username) {
      loadProfile(username);
    }
  }, [username]);

  const loadProfile = async (username: string) => {
    try {
      const data = await profileService.getPublicProfile(username);
      setProfile(data);
    } catch (error) {
      console.error('Failed to load profile:', error);
      setError('Profile not found');
    } finally {
      setLoading(false);
    }
  };

  const formatBusinessHours = (hours: any) => {
    if (!hours) return null;
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const formatted: string[] = [];
    
    days.forEach(day => {
      const dayHours = hours[day];
      if (dayHours && !dayHours.closed) {
        formatted.push(`${day}: ${dayHours.start} - ${dayHours.end}`);
      } else if (dayHours?.closed) {
        formatted.push(`${day}: Closed`);
      }
    });
    
    return formatted.join('\n');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading profile...</div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Profile Not Found</h1>
          <p className="text-gray-600">The profile you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-start gap-6">
            {profile.profilePicture && (
              <img
                src={profile.profilePicture}
                alt={`${profile.firstName} ${profile.lastName}`}
                className="w-24 h-24 rounded-full object-cover border-4 border-blue-100"
              />
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Dr. {profile.firstName} {profile.lastName}
              </h1>
              {profile.specialties && profile.specialties.length > 0 && (
                <p className="text-gray-600 mb-3">{profile.specialties.join(' • ')}</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                {profile.phoneNumber && (
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {profile.phoneNumber}
                  </div>
                )}
                {profile.email && (
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {profile.email}
                  </div>
                )}
                {profile.addressLine1 && (
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {profile.city}, {profile.country}
                  </div>
                )}
              </div>
            {/* Verified badge */}
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Verified Doctor
            </div>
          </div>
        
          <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
            Book Appointment
          </button>
        </div>
      </div>
    </div>

    {/* Main Content */}
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column - Main Info */}
        <div className="md:col-span-2 space-y-6">
          {/* Bio */}
          {profile.bio && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">About</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{profile.bio}</p>
            </div>
          )}

          {/* Experience */}
          {profile.yearsOfExperience && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Experience</h2>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">🏥</span>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{profile.yearsOfExperience} years</div>
                  <div className="text-sm text-gray-600">of professional experience</div>
                </div>
              </div>
            </div>
          )}

          {/* Postgraduate Education */}
          {profile.postgraduateEducation && profile.postgraduateEducation.length > 0 && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Postgraduate Education</h2>
              <ul className="space-y-3">
                {profile.postgraduateEducation.map((edu, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="text-blue-600 mt-1">•</span>
                    <span className="text-gray-700">{edu}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Specialty Courses */}
          {profile.specialtyCourses && profile.specialtyCourses.length > 0 && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Specialty Courses</h2>
              <ul className="space-y-3">
                {profile.specialtyCourses.map((course, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="text-blue-600 mt-1">•</span>
                    <span className="text-gray-700 text-sm">{course}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Certificates */}
          {profile.certificates && profile.certificates.length > 0 && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Certificates</h2>
              <div className="grid grid-cols-2 gap-4">
                {profile.certificates.map((cert, index) => (
                  <img
                    key={index}
                    src={cert}
                    alt={`Certificate ${index + 1}`}
                    className="w-full h-48 object-cover rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(cert, '_blank')}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Quick Info */}
        <div className="space-y-6">
          {/* License Info */}
          {profile.medicalLicense && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">License Information</h3>
              <div className="text-sm">
                <div className="text-gray-600 mb-1">License Number</div>
                <div className="font-mono font-semibold text-gray-900">{profile.medicalLicense}</div>
                {profile.licenseCountry && (
                  <>
                    <div className="text-gray-600 mt-3 mb-1">Country</div>
                    <div className="font-semibold text-gray-900">{profile.licenseCountry}</div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Online Consultation */}
          {profile.onlineConsultationCost && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Online Consultation</h3>
              <div className="mb-4">
                <div className="text-3xl font-bold text-blue-600">
                  ${profile.onlineConsultationCost} {profile.onlineConsultationCurrency || 'USD'}
                </div>
                <div className="text-sm text-gray-600">per session</div>
              </div>
              
              {profile.consultationPlatforms && profile.consultationPlatforms.length > 0 && (
                <>
                  <div className="text-sm text-gray-600 mb-2">Platforms</div>
                  <div className="flex flex-wrap gap-2">
                    {profile.consultationPlatforms.map(platform => (
                      <span key={platform} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                        {platform}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Languages */}
          {profile.languages && profile.languages.length > 0 && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Languages</h3>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map(lang => (
                  <span key={lang} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Business Hours */}
          {profile.businessHours && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Business Hours</h3>
              <div className="text-sm space-y-2">
                {formatBusinessHours(profile.businessHours)?.split('\n').map((line, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-gray-600">{line.split(':')[0]}:</span>
                    <span className="font-medium text-gray-900">{line.split(':').slice(1).join(':')}</span>
                  </div>
                ))}
              </div>
              {profile.timezone && (
                <div className="mt-3 pt-3 border-t text-xs text-gray-500">
                  Timezone: {profile.timezone}
                </div>
              )}
            </div>
          )}

          {/* Location Map */}
          {profile.addressLine1 && (
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Location</h3>
              <div className="text-sm text-gray-700 space-y-1">
                <div>{profile.addressLine1}</div>
                {profile.addressLine2 && <div>{profile.addressLine2}</div>}
                <div>{profile.city}, {profile.state} {profile.postalCode}</div>
                <div>{profile.country}</div>
              </div>
              <button className="mt-4 w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                Get Directions
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>);
};