import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, ArrowPathIcon, Squares2X2Icon, XMarkIcon } from '@heroicons/react/24/outline';

interface TimeSlot {
  time: string;
  hour: number;
  minute: number;
}

interface ApptProps {
  token: string;
}

// interface CalendarEvent {
//   id: string;
//   title: string;
//   start: Date;
//   end: Date;
//   type: 'appointment' | 'unavailability';
// }

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  selectedTime: string | null;
}

const AddEventModal: React.FC<AddEventModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded-2xl shadow-xl max-w-md w-full mx-4 border border-border">
        {/* Header */}
        <div className="bg-muted text-foreground px-6 py-4 rounded-t-2xl flex justify-between items-center border-b border-border">
          <h2 className="text-lg font-semibold tracking-wide">ADD NEW EVENT</h2>
          <button 
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <XMarkIcon className="w-6 h-8" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <h3 className="text-foreground text-lg mb-6">What kind of event would you like to add?</h3>
          
          <div className="space-y-3">
            <button className="w-full py-3 px-4 border-2 border-primary text-primary rounded-lg hover:bg-primary/10 transition-colors font-medium">
              UNAVAILABILITY
            </button>
            
            <button className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium">
              APPOINTMENT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AppointmentsTab: React.FC<ApptProps> = ({ token }) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [viewType, setViewType] = useState<'Day' | 'Week' | 'Month'>('Week');
  const [nostrUsername] = useState(() => {
    try {
      const adminProfile = localStorage.getItem('admin_profile');
      if (adminProfile) {
        const profile = JSON.parse(adminProfile);
        return profile.display_name || profile.name || 'Unknown';
      }
    } catch (error) {
      console.error('Error parsing admin_profile:', error);
    }
    return 'Unknown';
  });
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [selectedDateTime, setSelectedDateTime] = useState<{date: Date | null, time: string | null}>({
    date: null,
    time: null
  });
  const [workingPlan, setWorkingPlan] = useState<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to 7am on component mount
    if (scrollContainerRef.current) {
      const scrollTo = 7 * 4 * 18; // 7am in pixels (assuming 60px per hour)
      scrollContainerRef.current.scrollTop = scrollTo;
    }
  }, []);

  useEffect(() => {
    const fetchWorkingPlan = async () => {
      try {
        const response = await fetch('/api/admin/working-plan', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        if (data.status === 'success') {
          setWorkingPlan(data.working_plan);
        }
      } catch (error) {
        console.error('Failed to fetch working plan:', error);
      }
    };
    
    fetchWorkingPlan();
  }, [token]);

  // Generate time slots for 24 hours in 15-minute increments
  const timeSlots: TimeSlot[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      // const timeString = hour === 0 && minute === 0 ? '12 am' : 
      //                   hour < 12 ? `${hour}:${minute.toString().padStart(2, '0')} am` :
      //                   hour === 12 ? `12:${minute.toString().padStart(2, '0')} pm` :
      //                   `${hour - 12}:${minute.toString().padStart(2, '0')} pm`;
      
      timeSlots.push({
        time: minute === 0 ? (hour === 0 ? '12 am' : hour <= 12 ? `${hour} am` : `${hour - 12} pm`) : '',
        hour,
        minute
      });
    }
  }

  // Get week dates
  const getWeekDates = (date: Date) => {
    const week = [];
    const startDate = new Date(date);
    const day = startDate.getDay();
    const diff = startDate.getDate() - day;
    startDate.setDate(diff);

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      week.push(currentDate);
    }
    return week;
  };

  const weekDates = getWeekDates(currentWeek);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Format week range
  const formatWeekRange = () => {
    const start = weekDates[0];
    const end = weekDates[6];
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    
    if (start.getMonth() === end.getMonth()) {
      return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
    } else {
      return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${start.getFullYear()}`;
    }
  };

  // Navigation functions
  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(currentWeek.getDate() - 7);
    setCurrentWeek(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentWeek);
    newDate.setDate(currentWeek.getDate() + 7);
    setCurrentWeek(newDate);
  };

  const goToToday = () => {
    setCurrentWeek(new Date());
  };

  // Handle time slot click
  const handleTimeSlotClick = (date: Date, time: string) => {
    setSelectedDateTime({ date, time });
    setShowAddEventModal(true);
  };

  // Check if a time slot is unavailable check against working plan
  const isUnavailable = (date: Date, hour: number, minute: number) => {
    if (!workingPlan) return false;
    
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[date.getDay()];
    const dayPlan = workingPlan[dayName];
    
    if (!dayPlan) return false;
    
    const currentTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const startTime = dayPlan.start;
    const endTime = dayPlan.end;
    
    // Check if outside working hours
    if (currentTime < startTime || currentTime >= endTime) {
      return true;
    }
    
    // Check if during break time
    if (dayPlan.breaks) {
      for (const breakTime of dayPlan.breaks) {
        if (currentTime >= breakTime.start && currentTime < breakTime.end) {
          return true;
        }
      }
    }
    
    return false;
  };

  return (
    <div className="bg-card rounded-xl border border-gray-200 h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          {/* Provider Dropdown */}
          <div className="relative">
            <select 
              value={nostrUsername}
              className="bg-background border border-input rounded-lg px-4 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
            >
              <option value={nostrUsername}>{nostrUsername}</option>
            </select>
          </div>

          {/* View Options */}
          <div className="flex items-center space-x-2">
            <button className="p-2 text-muted-foreground hover:text-foreground bg-muted rounded">
              <CalendarIcon className="w-4 h-8" />
            </button>
            <button className="p-2 text-muted-foreground hover:text-foreground bg-muted rounded">
              <ArrowPathIcon className="w-4 h-8" />
            </button>
            <button className="p-2 text-muted-foreground hover:text-foreground bg-muted rounded">
              <Squares2X2Icon className="w-4 h-8" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button 
              onClick={goToPreviousWeek}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={goToNextWeek}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={goToToday}
              className="px-3 py-1 text-sm text-muted-foreground hover:text-foreground border border-border rounded"
            >
              Today
            </button>
          </div>

          <div className="text-foreground font-medium">
            {formatWeekRange()}
          </div>

          <div className="flex items-center space-x-1">
            {(['Day', 'Week', 'Month'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setViewType(view)}
                className={`px-3 py-1 text-sm rounded ${
                  viewType === view 
                    ? 'bg-accent text-accent-foreground' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Day Headers */}
        <div className="flex border-b border-border bg-card">
          <div className="w-20 p-3 text-sm text-muted-foreground border-r border-border">
            All Day
          </div>
          {weekDates.map((date, index) => {
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <div key={index} className="flex-1 p-3 text-center border-r border-border last:border-r-0">
                <div className={`text-sm ${isToday ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                  {dayNames[index]} {date.getMonth() + 1}/{date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scrollable Time Grid */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
        >
          <div className="flex">
            {/* Time Column */}
            <div className="w-20 bg-card">
              {timeSlots.map((slot) => (
                <div 
                  key={slot.hour}
                  className="h-8 flex items-start justify-end pr-2 pt-1 text-xs text-muted-foreground border-b border-r border-border"
                >
                  {slot.time}
                </div>
              ))}
            </div>

            {/* Day Columns */}
            {weekDates.map((date, dayIndex) => {
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div key={dayIndex} className={`flex-1 border-r border-border last:border-r-0 ${isToday ? 'bg-primary/10' : ''}`}>
                  {timeSlots.map((slot) => {
                    const unavailable = isUnavailable(date, slot.hour, slot.minute);
                    
                    return (
                      <div
                        key={`${dayIndex}-${slot.hour}`}
                        onClick={() => !unavailable && handleTimeSlotClick(date, slot.time)}
                        className={`h-8 border-b border-border relative ${
                          unavailable 
                            ? 'bg-gray-200 cursor-not-allowed' 
                            : 'hover:bg-muted cursor-pointer'
                        }`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      <AddEventModal 
        isOpen={showAddEventModal}
        onClose={() => setShowAddEventModal(false)}
        selectedDate={selectedDateTime.date}
        selectedTime={selectedDateTime.time}
      />
    </div>
  );
};