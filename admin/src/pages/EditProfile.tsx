import React, { useState, useEffect } from 'react';
import { profileService } from '../services/profile';
import { ProviderProfile } from '../types/profile';

interface EditProfileProps {
  token: string;
  onSave?: () => void;
}

export const EditProfile: React.FC<EditProfileProps> = ({ token, onSave }) => {
  const [profile, setProfile] = useState<Partial<ProviderProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'location' | 'education' | 'business'>('basic');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await profileService.getProfile(token);
      setProfile(data);
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await profileService.updateProfile(token, profile);
      alert('Profile saved successfully!');
      if (onSave) onSave();
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await profileService.uploadCertificate(token, file);
      setProfile({
        ...profile,
        certificates: [...(profile.certificates || []), url]
      });
    } catch (error) {
      console.error('Failed to upload certificate:', error);
      alert('Failed to upload certificate');
    }
  };

  const updateField = (field: keyof ProviderProfile, value: any) => {
    setProfile({ ...profile, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-white">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-700 p-6">
          <h1 className="text-2xl font-bold text-white mb-2">Edit Profile</h1>
          <p className="text-gray-400">Create your professional profile page</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-700 flex gap-1 px-6 bg-gray-750">
          {[
            { id: 'basic', label: 'Basic Info' },
            { id: 'location', label: 'Location & Contact' },
            { id: 'education', label: 'Education & Certificates' },
            { id: 'business', label: 'Business Details' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Username
                  </label>
                  <input
                    type="text"
                    value={profile.username || ''}
                    onChange={(e) => updateField('username', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="doctorsmith"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Your profile will be at: plebdoc.com/{profile.username || 'username'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Medical License Number
                  </label>
                  <input
                    type="text"
                    value={profile.medicalLicense || ''}
                    onChange={(e) => updateField('medicalLicense', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="4254197"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Years of Experience
                  </label>
                  <input
                    type="number"
                    value={profile.yearsOfExperience || ''}
                    onChange={(e) => updateField('yearsOfExperience', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={profile.phoneNumber || ''}
                    onChange={(e) => updateField('phoneNumber', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="+52 (55) 4890 2728"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Bio
                </label>
                <textarea
                  value={profile.bio || ''}
                  onChange={(e) => updateField('bio', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Tell patients about yourself..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Languages
                </label>
                <input
                  type="text"
                  value={profile.languages?.join(', ') || ''}
                  onChange={(e) => updateField('languages', e.target.value.split(',').map(s => s.trim()))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Spanish, English, French"
                />
                <p className="text-xs text-gray-400 mt-1">Separate with commas</p>
              </div>
            </div>
          )}

          {/* Location & Contact Tab */}
          {activeTab === 'location' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    value={profile.addressLine1 || ''}
                    onChange={(e) => updateField('addressLine1', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="Bosque de Duraznos 75, Suit 604-A, Floor 6"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    value={profile.addressLine2 || ''}
                    onChange={(e) => updateField('addressLine2', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="Bosques de las Lomas"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={profile.city || ''}
                    onChange={(e) => updateField('city', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="Ciudad de Mexico"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    State/Region
                  </label>
                  <input
                    type="text"
                    value={profile.state || ''}
                    onChange={(e) => updateField('state', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="CDMX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={profile.postalCode || ''}
                    onChange={(e) => updateField('postalCode', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="11700"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    value={profile.country || ''}
                    onChange={(e) => updateField('country', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="Mexico"
                  />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Business Hours</h3>
                <div className="space-y-3">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                    <div key={day} className="flex items-center gap-4">
                      <div className="w-32 text-gray-300">{day}</div>
                      <input
                        type="time"
                        value={profile.businessHours?.[day]?.start || ''}
                        onChange={(e) => updateField('businessHours', {
                          ...profile.businessHours,
                          [day]: { ...profile.businessHours?.[day], start: e.target.value }
                        })}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                      <span className="text-gray-400">to</span>
                      <input
                        type="time"
                        value={profile.businessHours?.[day]?.end || ''}
                        onChange={(e) => updateField('businessHours', {
                          ...profile.businessHours,
                          [day]: { ...profile.businessHours?.[day], end: e.target.value }
                        })}
                        className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                      <label className="flex items-center gap-2 text-gray-300">
                        <input
                          type="checkbox"
                          checked={profile.businessHours?.[day]?.closed || false}
                          onChange={(e) => updateField('businessHours', {
                            ...profile.businessHours,
                            [day]: { ...profile.businessHours?.[day], closed: e.target.checked }
                          })}
                          className="rounded"
                        />
                        Closed
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Education & Certificates Tab */}
          {activeTab === 'education' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Postgraduate Education
                </label>
                <textarea
                  value={profile.postgraduateEducation?.join('\n') || ''}
                  onChange={(e) => updateField('postgraduateEducation', e.target.value.split('\n').filter(s => s.trim()))}
                  rows={4}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono text-sm"
                  placeholder="TIRR, The Institute of Research and Rehabilitation&#10;Muscular and Joint Chains Method G.D.S."
                />
                <p className="text-xs text-gray-400 mt-1">One per line</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Specialty Courses
                </label>
                <textarea
                  value={profile.specialtyCourses?.join('\n') || ''}
                  onChange={(e) => updateField('specialtyCourses', e.target.value.split('\n').filter(s => s.trim()))}
                  rows={6}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono text-sm"
                  placeholder="Clinical Management of the Cervical/Thoracic/Shoulder Complex TIRR, Houston, TX. 2004&#10;Cupping, CDMX, 2017"
                />
                <p className="text-xs text-gray-400 mt-1">One per line</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Certificates
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  {profile.certificates?.map((url, index) => (
                    <div key={index} className="relative group">
                      <img src={url} alt={`Certificate ${index + 1}`} className="w-full h-32 object-cover rounded-lg border border-gray-600" />
                      <button
                        onClick={() => {
                          const newCerts = [...(profile.certificates || [])];
                          newCerts.splice(index, 1);
                          updateField('certificates', newCerts);
                        }}
                        className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
              </div>
            </div>
          )}

          {/* Business Details Tab */}
          {activeTab === 'business' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Online Consultation Cost
                  </label>
                  <input
                    type="number"
                    value={profile.onlineConsultationCost || ''}
                    onChange={(e) => updateField('onlineConsultationCost', parseFloat(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    placeholder="70"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Currency
                  </label>
                  <select
                    value={profile.onlineConsultationCurrency || 'USD'}
                    onChange={(e) => updateField('onlineConsultationCurrency', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="MXN">MXN</option>
                    <option value="BTC">BTC</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Consultation Platforms
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Zoom', 'Facetime', 'WhatsApp', 'Google Meet', 'Skype'].map(platform => (
                    <label key={platform} className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg text-gray-300 cursor-pointer hover:bg-gray-600">
                      <input
                        type="checkbox"
                        checked={profile.consultationPlatforms?.includes(platform) || false}
                        onChange={(e) => {
                          const platforms = profile.consultationPlatforms || [];
                          if (e.target.checked) {
                            updateField('consultationPlatforms', [...platforms, platform]);
                          } else {
                            updateField('consultationPlatforms', platforms.filter(p => p !== platform));
                          }
                        }}
                        className="rounded"
                      />
                      {platform}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Timezone
                </label>
                <select
                  value={profile.timezone || 'UTC'}
                  onChange={(e) => updateField('timezone', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="America/Mexico_City">Central Time (Mexico City)</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time (US)</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="Europe/London">GMT</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 p-6 flex justify-between items-center bg-gray-750">
          <a
            href={`/${profile.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            View Public Profile →
          </a>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
};