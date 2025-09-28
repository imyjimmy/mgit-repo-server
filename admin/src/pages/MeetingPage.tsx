// MeetingPage.tsx
import { useParams } from 'react-router-dom';
import { WebRTCTest } from '@/components/WebRTCTest';

interface MeetingPageProps {
  token: string;
}

export const MeetingPage = ({ token }: MeetingPageProps) => {
  const { roomId } = useParams();
  
  return (
    <div className="h-screen">
      <WebRTCTest 
        token={token} 
        initialRoomId={roomId}
      />
    </div>
  );
};