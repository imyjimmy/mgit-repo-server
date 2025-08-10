import React from 'react';

interface RegistrationViewProps {
  pubkey: string;
  onRegistrationComplete?: () => void;
}

export const RegistrationView: React.FC<RegistrationViewProps> = ({ pubkey }) => {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 rounded-xl p-8 shadow-xl border border-gray-700 max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">🏥 Registration Required</h1>
          <p className="text-gray-400">Complete your admin registration</p>
        </div>
        
        <div className="space-y-4">
          <div className="bg-gray-700 p-4 rounded-lg">
            <h3 className="text-white font-semibold mb-2">Authenticated Identity</h3>
            <p className="text-gray-300 text-sm break-all">{pubkey}</p>
          </div>
          
          <div className="bg-blue-900 border border-blue-600 p-4 rounded-lg">
            <h3 className="text-blue-200 font-semibold mb-2">Next Steps</h3>
            <p className="text-blue-100 text-sm">
              Your Nostr identity has been verified, but you need to be registered 
              as an admin user in the system. Please contact your system administrator 
              to complete the registration process.
            </p>
          </div>
          
          <div className="text-center mt-6">
            <p className="text-gray-400 text-sm">
              Hello World - Registration Component Placeholder
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};