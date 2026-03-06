/**
 * Firebase functions for venue management
 * Each admin manages their own venues (filtered by ownerId)
 *
 * Venues are stored in `/venues/{venueId}` collection
 */

import { db, isFirebaseEnabled } from './config';
import { currentUser } from './auth';
import { isAdmin } from './admin';
import type { Venue, CreateVenueData } from '$lib/types/venue';
import { isSuperAdmin } from './admin';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	deleteDoc,
	query,
	where,
	orderBy,
	serverTimestamp,
	writeBatch
} from 'firebase/firestore';
import { get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Get all venues for current admin
 */
export async function getMyVenues(): Promise<Venue[]> {
	if (!browser || !isFirebaseEnabled()) {
		return [];
	}

	const user = get(currentUser);
	if (!user) {
		return [];
	}

	const adminStatus = await isAdmin();
	if (!adminStatus) {
		return [];
	}

	try {
		const venuesRef = collection(db!, 'venues');
		const q = query(venuesRef, where('ownerId', '==', user.id), orderBy('name'));
		const snapshot = await getDocs(q);

		const venues: Venue[] = [];
		snapshot.forEach((docSnap) => {
			venues.push({ id: docSnap.id, ...docSnap.data() } as Venue);
		});

		console.log(`✅ Loaded ${venues.length} venues for admin`);
		return venues;
	} catch (error) {
		console.error('❌ Error getting venues:', error);
		return [];
	}
}

/**
 * Get all venues from all admins (for shared venue selection)
 */
export async function getAllVenues(): Promise<Venue[]> {
	if (!browser || !isFirebaseEnabled()) {
		return [];
	}

	const user = get(currentUser);
	if (!user) {
		return [];
	}

	const adminStatus = await isAdmin();
	if (!adminStatus) {
		return [];
	}

	try {
		const venuesRef = collection(db!, 'venues');
		const q = query(venuesRef, orderBy('name'));
		const snapshot = await getDocs(q);

		const venues: Venue[] = [];
		snapshot.forEach((docSnap) => {
			venues.push({ id: docSnap.id, ...docSnap.data() } as Venue);
		});

		console.log(`✅ Loaded ${venues.length} venues (all admins)`);
		return venues;
	} catch (error) {
		console.error('❌ Error getting all venues:', error);
		return [];
	}
}

/**
 * Search venues by name, city, or address (for autocomplete)
 * Filters client-side since Firestore doesn't support partial text search
 */
export async function searchVenues(searchQuery: string): Promise<Venue[]> {
	if (!browser || !isFirebaseEnabled()) {
		return [];
	}
	if (!searchQuery || searchQuery.length < 2) {
		return [];
	}

	try {
		const allVenues = await getMyVenues();
		const queryLower = searchQuery.toLowerCase();

		return allVenues
			.filter(
				(v) =>
					v.name.toLowerCase().includes(queryLower) ||
					v.city.toLowerCase().includes(queryLower) ||
					v.address?.toLowerCase().includes(queryLower)
			)
			.slice(0, 10);
	} catch (error) {
		console.error('❌ Error searching venues:', error);
		return [];
	}
}

/**
 * Create a new venue
 */
export async function createVenue(data: CreateVenueData): Promise<Venue | null> {
	if (!browser || !isFirebaseEnabled()) {
		return null;
	}

	const user = get(currentUser);
	if (!user) {
		console.error('❌ No user logged in');
		return null;
	}

	const adminStatus = await isAdmin();
	if (!adminStatus) {
		console.error('❌ User is not an admin');
		return null;
	}

	try {
		const venueId = `venue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
		const venueRef = doc(db!, 'venues', venueId);

		const venue: Partial<Venue> = {
			id: venueId,
			ownerId: user.id,
			ownerName: user.name || 'Unknown',
			name: data.name.trim(),
			city: data.city.trim(),
			country: data.country
		};

		// Only add optional fields if they have values
		if (data.address?.trim()) {
			venue.address = data.address.trim();
		}
		if (data.googleMapsUrl?.trim()) {
			venue.googleMapsUrl = data.googleMapsUrl.trim();
		}

		await setDoc(venueRef, {
			...venue,
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp()
		});

		console.log('✅ Venue created:', venue.name);
		return venue as Venue;
	} catch (error) {
		console.error('❌ Error creating venue:', error);
		return null;
	}
}

/**
 * Update an existing venue
 */
export async function updateVenue(
	venueId: string,
	updates: Partial<Omit<Venue, 'id' | 'ownerId' | 'createdAt'>>
): Promise<boolean> {
	if (!browser || !isFirebaseEnabled()) {
		return false;
	}

	const user = get(currentUser);
	if (!user) {
		return false;
	}

	try {
		const venueRef = doc(db!, 'venues', venueId);
		const venueSnap = await getDoc(venueRef);

		if (!venueSnap.exists()) {
			console.error('❌ Venue not found');
			return false;
		}

		// Verify ownership
		const venueData = venueSnap.data();
		if (venueData.ownerId !== user.id) {
			console.error('❌ Not authorized to update this venue');
			return false;
		}

		await updateDoc(venueRef, {
			...updates,
			updatedAt: serverTimestamp()
		});

		console.log('✅ Venue updated:', venueId);
		return true;
	} catch (error) {
		console.error('❌ Error updating venue:', error);
		return false;
	}
}

/**
 * Delete a venue
 */
export async function deleteVenue(venueId: string): Promise<boolean> {
	if (!browser || !isFirebaseEnabled()) {
		return false;
	}

	const user = get(currentUser);
	if (!user) {
		return false;
	}

	try {
		const venueRef = doc(db!, 'venues', venueId);
		const venueSnap = await getDoc(venueRef);

		if (!venueSnap.exists()) {
			console.error('❌ Venue not found');
			return false;
		}

		// Verify ownership
		const venueData = venueSnap.data();
		if (venueData.ownerId !== user.id) {
			console.error('❌ Not authorized to delete this venue');
			return false;
		}

		await deleteDoc(venueRef);
		console.log('✅ Venue deleted:', venueId);
		return true;
	} catch (error) {
		console.error('❌ Error deleting venue:', error);
		return false;
	}
}

/**
 * Get venue by ID
 */
export async function getVenueById(venueId: string): Promise<Venue | null> {
	if (!browser || !isFirebaseEnabled()) {
		return null;
	}

	try {
		const venueRef = doc(db!, 'venues', venueId);
		const venueSnap = await getDoc(venueRef);

		if (venueSnap.exists()) {
			return { id: venueSnap.id, ...venueSnap.data() } as Venue;
		}
		return null;
	} catch (error) {
		console.error('❌ Error getting venue:', error);
		return null;
	}
}

/**
 * Get tournaments that reference a specific venueId
 * Used to check dependencies before deleting a venue
 */
export async function getVenueTournamentDependencies(venueId: string): Promise<{ id: string; name: string; status: string }[]> {
	if (!browser || !isFirebaseEnabled()) {
		return [];
	}

	try {
		const tournamentsRef = collection(db!, 'tournaments');
		const q = query(tournamentsRef, where('venueId', '==', venueId));
		const snapshot = await getDocs(q);

		const deps: { id: string; name: string; status: string }[] = [];
		snapshot.forEach((docSnap) => {
			const data = docSnap.data();
			deps.push({ id: docSnap.id, name: data.name || 'Sin nombre', status: data.status || 'UNKNOWN' });
		});

		return deps;
	} catch (error) {
		console.error('❌ Error getting venue tournament dependencies:', error);
		return [];
	}
}

/**
 * Delete a venue as SuperAdmin (no ownership check)
 */
export async function deleteVenueAsSuperAdmin(venueId: string): Promise<boolean> {
	if (!browser || !isFirebaseEnabled()) {
		return false;
	}

	const superAdmin = await isSuperAdmin();
	if (!superAdmin) {
		console.error('❌ Not a SuperAdmin');
		return false;
	}

	try {
		const venueRef = doc(db!, 'venues', venueId);
		await deleteDoc(venueRef);
		console.log('✅ Venue deleted by SuperAdmin:', venueId);
		return true;
	} catch (error) {
		console.error('❌ Error deleting venue as SuperAdmin:', error);
		return false;
	}
}

/**
 * Merge two venues: move all tournament references from source to target, then delete source.
 * Uses writeBatch for atomicity.
 */
export async function mergeVenues(
	sourceVenueId: string,
	targetVenueId: string
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
	if (!browser || !isFirebaseEnabled()) {
		return { success: false, updatedCount: 0, error: 'Firebase not available' };
	}

	const superAdmin = await isSuperAdmin();
	if (!superAdmin) {
		return { success: false, updatedCount: 0, error: 'Not a SuperAdmin' };
	}

	try {
		// Get target venue data for denormalized fields
		const targetVenue = await getVenueById(targetVenueId);
		if (!targetVenue) {
			return { success: false, updatedCount: 0, error: 'Target venue not found' };
		}

		// Find all tournaments referencing source venue
		const tournamentsRef = collection(db!, 'tournaments');
		const q = query(tournamentsRef, where('venueId', '==', sourceVenueId));
		const snapshot = await getDocs(q);

		const batch = writeBatch(db!);
		let count = 0;

		snapshot.forEach((docSnap) => {
			batch.update(docSnap.ref, {
				venueId: targetVenueId,
				address: targetVenue.address || '',
				city: targetVenue.city,
				country: targetVenue.country
			});
			count++;
		});

		// Delete source venue
		const sourceRef = doc(db!, 'venues', sourceVenueId);
		batch.delete(sourceRef);

		await batch.commit();
		console.log(`✅ Merged venue ${sourceVenueId} → ${targetVenueId}, ${count} tournaments updated`);
		return { success: true, updatedCount: count };
	} catch (error) {
		console.error('❌ Error merging venues:', error);
		return { success: false, updatedCount: 0, error: String(error) };
	}
}

/**
 * Get all venues owned by a specific user
 * Used to check dependencies before deleting a user
 *
 * @param userId User ID to check
 * @returns Array of venues owned by the user
 */
export async function getVenuesByOwner(userId: string): Promise<Venue[]> {
	if (!browser || !isFirebaseEnabled()) {
		return [];
	}

	try {
		const venuesRef = collection(db!, 'venues');
		const q = query(venuesRef, where('ownerId', '==', userId));
		const snapshot = await getDocs(q);

		const venues: Venue[] = [];
		snapshot.forEach((docSnap) => {
			venues.push({ id: docSnap.id, ...docSnap.data() } as Venue);
		});

		console.log(`✅ Found ${venues.length} venues for user ${userId}`);
		return venues;
	} catch (error) {
		console.error('❌ Error getting venues by owner:', error);
		return [];
	}
}
