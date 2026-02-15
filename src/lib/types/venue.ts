/**
 * Venue entity for tournament locations
 * Stored in /venues/{venueId} collection in Firebase
 * Each admin manages their own venues (filtered by ownerId)
 */

import type { Timestamp } from 'firebase/firestore';

export interface Venue {
	id: string; // Auto-generated UUID
	ownerId: string; // Admin who created this venue

	// Location details
	name: string; // Venue name (e.g., "Club Crokitorra")
	address?: string; // Street address (optional)
	city: string; // City
	country: string; // Country

	// Optional fields
	googleMapsUrl?: string; // Direct Google Maps link

	// Metadata
	createdAt: Timestamp | number;
	updatedAt: Timestamp | number;
}

/**
 * Data required to create a new venue
 */
export type CreateVenueData = Omit<Venue, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;

/**
 * Generate full display string for venue
 * Example: "Club Crokitorra, Carrer Major 15, Barcelona, España"
 */
export function getVenueDisplayString(venue: Venue): string {
	const parts = [venue.name];
	if (venue.address) parts.push(venue.address);
	parts.push(venue.city);
	parts.push(venue.country);
	return parts.join(', ');
}

/**
 * Generate short display string for venue (name + city)
 * Example: "Club Crokitorra - Barcelona"
 */
export function getVenueShortDisplay(venue: Venue): string {
	return `${venue.name} - ${venue.city}`;
}

/**
 * Generate location-only display (address, city, country)
 * Example: "Carrer Major 15, Barcelona, España"
 */
export function getVenueLocationDisplay(venue: Venue): string {
	const parts: string[] = [];
	if (venue.address) parts.push(venue.address);
	parts.push(venue.city);
	parts.push(venue.country);
	return parts.join(', ');
}
