import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';

export interface DownloadProgress {
	progress: number; // 0-100
	status: 'downloading' | 'opening' | 'complete' | 'error';
	error?: string;
}

/**
 * Downloads an APK file and opens it for installation
 * @param url The URL of the APK file to download
 * @param filename The filename to save the APK as (e.g., "scorekinole-2.4.8.apk")
 * @param onProgress Callback for progress updates
 */
export async function downloadAndInstallApk(
	url: string,
	filename: string,
	onProgress?: (progress: DownloadProgress) => void
): Promise<boolean> {
	// Only works on Android
	if (Capacitor.getPlatform() !== 'android') {
		console.warn('APK installation only works on Android');
		return false;
	}

	try {
		onProgress?.({ progress: 0, status: 'downloading' });

		// Download the APK file
		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`Download failed: ${response.status} ${response.statusText}`);
		}

		const contentLength = response.headers.get('content-length');
		const total = contentLength ? parseInt(contentLength, 10) : 0;

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('Unable to read response body');
		}

		const chunks: Uint8Array[] = [];
		let received = 0;

		// Read chunks with progress
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			chunks.push(value);
			received += value.length;

			if (total > 0) {
				const progress = Math.round((received / total) * 100);
				onProgress?.({ progress, status: 'downloading' });
			}
		}

		// Combine chunks into a single array
		const blob = new Blob(chunks, { type: APK_MIME_TYPE });
		const arrayBuffer = await blob.arrayBuffer();
		const base64 = arrayBufferToBase64(arrayBuffer);

		onProgress?.({ progress: 100, status: 'downloading' });

		// Save file to Downloads directory
		const savedFile = await Filesystem.writeFile({
			path: filename,
			data: base64,
			directory: Directory.External,
			recursive: true
		});

		console.log('📦 APK saved to:', savedFile.uri);

		onProgress?.({ progress: 100, status: 'opening' });

		// Open the APK file for installation
		await FileOpener.open({
			filePath: savedFile.uri,
			contentType: APK_MIME_TYPE
		});

		onProgress?.({ progress: 100, status: 'complete' });
		return true;

	} catch (error) {
		console.error('❌ APK download/install failed:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		onProgress?.({ progress: 0, status: 'error', error: errorMessage });
		return false;
	}
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Extract filename from APK download URL
 */
export function extractApkFilename(url: string): string {
	const parts = url.split('/');
	const filename = parts[parts.length - 1];
	return filename.endsWith('.apk') ? filename : 'update.apk';
}
