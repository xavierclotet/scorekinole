<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { APP_VERSION } from '$lib/constants';
	import { Browser } from '@capacitor/browser';
	import { dismissVersion } from '$lib/utils/versionCheck';
	import Button from './Button.svelte';

	interface Props {
		isOpen?: boolean;
		latestVersion: string;
		downloadUrl: string;
		onclose?: () => void;
	}

	let { isOpen = false, latestVersion, downloadUrl, onclose }: Props = $props();

	async function openDownload() {
		// Open in system browser (Chrome) which properly handles APK downloads
		await Browser.open({ url: downloadUrl });
		onclose?.();
	}

	function dismiss() {
		// Remember that user dismissed this version, won't show again until next version
		dismissVersion(latestVersion);
		onclose?.();
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85"
		role="dialog"
		aria-modal="true"
	>
		<div
			class="m-4 w-full max-w-[400px] max-h-[90vh] overflow-y-auto rounded-xl border-2 border-primary/30 bg-card p-8 animate-in fade-in zoom-in-95 duration-200"
		>
			<div class="mb-6 text-center">
				<span class="text-xl font-bold text-card-foreground">{m.update_available()}</span>
			</div>

			<div class="flex flex-col items-center gap-5">
				<div class="text-5xl">📱</div>

				<p class="m-0 text-center text-base leading-relaxed text-muted-foreground">
					{m.update_newVersionAvailable()}
				</p>

				<div class="w-full rounded-lg bg-muted/50 p-4">
					<div class="flex items-center justify-between border-b border-border py-2">
						<span class="text-sm text-muted-foreground">{m.update_currentVersion()}</span>
						<span class="font-semibold text-muted-foreground">{APP_VERSION}</span>
					</div>
					<div class="flex items-center justify-between py-2">
						<span class="text-sm text-muted-foreground">{m.update_latestVersion()}</span>
						<span class="font-semibold text-primary">{latestVersion}</span>
					</div>
				</div>

				<div class="mt-2 flex w-full gap-4">
					<Button variant="secondary" onclick={dismiss} class="flex-1">
						{m.common_later()}
					</Button>
					<Button variant="primary" onclick={openDownload} class="flex-1">
						{m.update_download()}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
