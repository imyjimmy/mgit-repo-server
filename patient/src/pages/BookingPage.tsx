import { BookingWorkflow } from '../components/booking/BookingWorkflow';

export default function BookingPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="py-10">
        <header>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Book an Appointment
            </h1>
          </div>
        </header>
        <main>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <BookingWorkflow />
          </div>
        </main>
      </div>
    </div>
  );
}