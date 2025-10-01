import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { profileService } from '../services/profile';
import { ProviderProfile } from '../types/profile';
import { ArrowLeft, UserCircle } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

interface EditProfileProps {
  token: string;
  onSave?: () => void;
}

export const EditProfile: React.FC<EditProfileProps> = ({ token, onSave }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Partial<ProviderProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'basic' | 'credentials' | 'additional'>('basic');

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

  const updateField = (field: keyof ProviderProfile, value: any) => {
    setProfile({ ...profile, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-900 dark:text-white">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header with Back Button */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to Dashboard</span>
          </button>
          <div className="flex-1 text-center">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Edit Profile</h1>
          </div>
          {/* Theme Toggle */}
          <ThemeToggle />
        </div>
      </div>
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700 flex gap-1 px-6 bg-gray-50 dark:bg-gray-800">
            {[
              { id: 'basic', label: 'Basic Info' },
              { id: 'credentials', label: 'License & Education' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
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
              <div className="space-y-12">
                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-white">Profile</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      This information will be displayed publicly.
                    </p>
                  </div>

                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
                    <div className="sm:col-span-4">
                      <label htmlFor="username" className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                        Username
                      </label>
                      <div className="mt-2">
                        <div className="flex items-center rounded-md bg-white pl-3 outline outline-1 -outline-offset-1 outline-gray-300 focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-indigo-600 dark:bg-white/5 dark:outline-white/10 dark:focus-within:outline-indigo-500">
                          <div className="shrink-0 select-none text-base text-gray-500 sm:text-sm/6 dark:text-gray-400">
                            workcation.com/
                          </div>
                          <input
                            id="username"
                            name="username"
                            type="text"
                            placeholder="janesmith"
                            className="block min-w-0 grow bg-white py-1.5 pl-1 pr-3 text-base text-gray-900 placeholder:text-gray-400 focus:outline focus:outline-0 sm:text-sm/6 dark:bg-transparent dark:text-white dark:placeholder:text-gray-500"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-full">
                      <label htmlFor="photo" className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                        Photo
                      </label>
                      <div className="mt-2 flex items-center gap-x-3">
                        <UserCircle aria-hidden="true" className="size-12 text-gray-300 dark:text-gray-500" />
                        <button
                          type="button"
                          className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:shadow-none dark:ring-white/5 dark:hover:bg-white/20"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                    <div className="col-span-full">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Professional Biography
                      </label>
                      <textarea
                        value={profile.bio || ''}
                        onChange={(e) => updateField('bio', e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Tell patients about your experience, approach to care, and what makes your practice unique..."
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-white">Personal Information</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      Some basic information about you.
                    </p>
                  </div>

                  { /* First Name, Last Name, suffix. */}
                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-8 md:col-span-2">
                    <div className="sm:col-span-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          First Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={profile.firstName || ''}
                          onChange={(e) => updateField('firstName', e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                          placeholder="John"
                          required
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Last Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={profile.lastName || ''}
                          onChange={(e) => updateField('lastName', e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                          placeholder="Smith"
                          required
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-1">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Suffix
                        </label>
                        <input
                          type="text"
                          value={profile.suffix || ''}
                          onChange={(e) => updateField('suffix', e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                          placeholder="Jr"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-white">Details</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      Completely optional, it helps our patients know you on a deeper level.
                    </p>
                  </div>

                  { /* Gender, Year of Birth, Place of Birth. */}
                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-8 md:col-span-2">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Gender
                      </label>
                      <select
                        value={profile.gender || ''}
                        onChange={(e) => updateField('gender', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                      >
                        <option value="">Select...</option>
                        <option value="M">Male</option>
                        <option value="F">Female</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Year of Birth
                      </label>
                      <input
                        type="number"
                        value={profile.yearOfBirth || ''}
                        onChange={(e) => updateField('yearOfBirth', parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="1975"
                        min="1920"
                        max={new Date().getFullYear()}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Place of Birth
                      </label>
                      <input
                        type="text"
                        value={profile.placeOfBirth || ''}
                        onChange={(e) => updateField('placeOfBirth', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Texas, USA"
                        maxLength={30}
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Languages Spoken
                      </label>
                      <input
                        type="text"
                        value={profile.languages?.join(', ') || ''}
                        onChange={(e) => updateField('languages', e.target.value.split(',').map(s => s.trim()))}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="English, Spanish, French"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Separate with commas</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Credentials Tab */}
            {activeTab === 'credentials' && (
              <div className="space-y-12">
                {/* Medical License */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-white">Medical License</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      State-issued license required for practice.
                    </p>
                  </div>

                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        License Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={profile.licenseNumber || ''}
                        onChange={(e) => updateField('licenseNumber', e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="K9472"
                        maxLength={9}
                        required
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        License State
                      </label>
                      <input
                        type="text"
                        value={profile.licenseState || 'TX'}
                        onChange={(e) => updateField('licenseState', e.target.value.toUpperCase())}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="TX"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>

                {/* Medical Education */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-white">Medical Education</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      Provide your medical school details and degree.
                    </p>
                  </div>

                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
                    <div className="col-span-full">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Medical School <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={profile.medicalSchool || ''}
                        onChange={(e) => updateField('medicalSchool', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Baylor College of Medicine, Houston, TX"
                        maxLength={67}
                        required
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Graduation Year <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={profile.graduationYear || ''}
                        onChange={(e) => updateField('graduationYear', parseInt(e.target.value))}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="2000"
                        min="1950"
                        max={new Date().getFullYear()}
                        required
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Degree Type <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={profile.degreeType || ''}
                        onChange={(e) => updateField('degreeType', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        required
                      >
                        <option value="">Select...</option>
                        <option value="MD">MD</option>
                        <option value="DO">DO</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Specialties */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-white/10 pb-12 md:grid-cols-3">
                  <div>
                    <h2 className="text-base/7 font-semibold text-white">Specialties</h2>
                    <p className="mt-1 text-sm/6 text-gray-400">
                      Add your primary and secondary specialties.
                    </p>
                  </div>

                  <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Primary Specialty
                      </label>
                      <input
                        type="text"
                        value={profile.primarySpecialty || ''}
                        onChange={(e) => updateField('primarySpecialty', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Internal Medicine"
                        maxLength={30}
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Secondary Specialty
                      </label>
                      <input
                        type="text"
                        value={profile.secondarySpecialty || ''}
                        onChange={(e) => updateField('secondarySpecialty', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500"
                        placeholder="Sleep Medicine"
                        maxLength={30}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Board Certifications
                      </label>
                      <textarea
                        value={profile.boardCertifications?.join('\n') || ''}
                        onChange={(e) => updateField('boardCertifications', e.target.value.split('\n').filter(s => s.trim()))}
                        rows={3}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-blue-500 font-mono text-sm"
                        placeholder="American Board of Internal Medicine&#10;American Board of Sleep Medicine"
                      />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">One certification per line</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
            <a
              href={`/${profile.username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm"
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
    </div>
  );
};