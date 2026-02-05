<script lang="ts">
	interface Props {
		title: string;
		description: string;
		keywords?: string;
		canonical?: string;
		ogImage?: string;
		ogType?: 'website' | 'article';
		noindex?: boolean;
		jsonLd?: object | object[];
	}

	const BASE_URL = 'https://scorekinole.web.app';
	const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.png`;

	let {
		title,
		description,
		keywords = 'crokinole, scoring, tournament, scorekinole, crokinole app, live scoring',
		canonical,
		ogImage = DEFAULT_OG_IMAGE,
		ogType = 'website',
		noindex = false,
		jsonLd
	}: Props = $props();

	let fullTitle = $derived(title.includes('Scorekinole') ? title : `${title} | Scorekinole`);
	let canonicalUrl = $derived(canonical || BASE_URL);
	let jsonLdScript = $derived(jsonLd ? JSON.stringify(Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : null);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<meta name="keywords" content={keywords} />

	<!-- Robots -->
	{#if noindex}
		<meta name="robots" content="noindex, nofollow" />
	{:else}
		<meta name="robots" content="index, follow" />
	{/if}

	<!-- Canonical -->
	<link rel="canonical" href={canonicalUrl} />

	<!-- Open Graph -->
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:type" content={ogType} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:site_name" content="Scorekinole" />
	<meta property="og:locale" content="en_US" />
	<meta property="og:locale:alternate" content="es_ES" />
	<meta property="og:locale:alternate" content="ca_ES" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />

	<!-- hreflang for multilingual -->
	<link rel="alternate" hreflang="en" href="{BASE_URL}/" />
	<link rel="alternate" hreflang="es" href="{BASE_URL}/?lang=es" />
	<link rel="alternate" hreflang="ca" href="{BASE_URL}/?lang=ca" />
	<link rel="alternate" hreflang="x-default" href="{BASE_URL}/" />

	<!-- JSON-LD Structured Data -->
	{#if jsonLdScript}
		{@html `<script type="application/ld+json">${jsonLdScript}</script>`}
	{/if}
</svelte:head>
