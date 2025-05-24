# RideShare

A web application for university ride sharing, allowing users to offer, find, and book rides within the campus community.

## Features Implemented

### Core Ride Features
- **Create a Ride (Host Offers a Ride)**: Users (students or faculty) can offer rides by specifying destination, timing, gender preference, and available seats.
- **Find Matching Rides (Rider Looks for a Ride)**: Users can search for available rides based on destination and gender preference. Only rides matching the user's role (student/faculty) and filters are shown.
- **Book a Ride**: Riders can book available seats in listed rides. Seat count decreases automatically, and booking is prevented if full or already booked.
- **Cancel Ride Booking**: Riders can cancel their booking. The seat is released, and the ride status is updated accordingly.
- **Complete a Ride**: Hosts can mark rides as completed once finished. Notifications are sent to all involved users.
- **View Ride History**: Users can view their past completed rides.
- **View Rides Created**: Hosts can see rides they have created.
- **Delete a Ride**: Hosts can delete rides they have created.

### Notifications
- Real-time notifications for ride creation, booking, cancellation, and completion using WebSockets.
- Notifications are stored in the database and pushed to online users.

### Roles and Filters
- Both students and faculty can use the platform.
- Gender preference and role-based matching are enforced for ride safety and comfort.

### Frontend Functionality
- **Create Ride Form**: React component for hosts to offer rides.
- **Search Rides**: React components for riders to search for rides by destination and preference.
- **Dashboard**: Central hub to offer rides, find rides, and view results.

## Tech Stack

- **Frontend:** React (JavaScript), CSS, HTML
- **Backend:** Node.js, Express, MongoDB
- **Real-time:** Socket.io for live notifications

## Getting Started

### Prerequisites
- Node.js and npm
- MongoDB instances


## Usage

- Register/login as a user (student or faculty).
- Offer a ride using the "Offer a Ride" form.
- Find rides via destination and gender preference.
- Book or cancel ride bookings as needed.
- Mark rides as completed after journey ends.
- Receive real-time notifications for all updates.

## Future Enhancements

- User authentication and profile management
- Ratings and reviews for rides and users
- Advanced filtering (timing, recurring rides, etc.)
- Admin dashboard and analytics


## Here are some glimpse of our website.

**1.Register**
![image](https://github.com/user-attachments/assets/f3e1f4a0-b374-4e32-9d19-65c0227441f1)

**2.Login**
![image](https://github.com/user-attachments/assets/c58c959d-3e93-4828-ba53-555c4284df32)

**3.Create-Ride**
![image](https://github.com/user-attachments/assets/f8a71469-d4c9-4254-bb0d-390ad0b1ef94)

**4.Your Rides**
![image](https://github.com/user-attachments/assets/3c2c4551-7029-4579-9b45-4d16fab82d7d)

**5.Search Ride**
![image](https://github.com/user-attachments/assets/d398f4ae-af3b-4f63-8c05-d5a77e5bde27)

**6.Result of Search and Book**
![image](https://github.com/user-attachments/assets/a097ab04-fe55-4303-ab6a-3af722074e2f)

> _This README reflects the currently implemented features as of now. Contributions and suggestions welcome!_
