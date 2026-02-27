<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>Scorekinole - {m.privacy_title()}</title>
</svelte:head>

<main class="privacy-page">
	<div class="container">
		<a href="/" class="back-link">&larr; {m.common_back()}</a>

		<h1>{m.privacy_title()}</h1>
		<p class="last-updated">{m.privacy_lastUpdated()}</p>

		<section>
			<h2>{m.privacy_whatWeCollectTitle()}</h2>
			<p>{m.privacy_whatWeCollectIntro()}</p>
			<ul>
				<li>{m.privacy_dataName()}</li>
				<li>{m.privacy_dataEmail()}</li>
				<li>{m.privacy_dataPhoto()}</li>
				<li>{m.privacy_dataGameStats()}</li>
			</ul>
		</section>

		<section>
			<h2>{m.privacy_howWeUseTitle()}</h2>
			<ul>
				<li>{m.privacy_useSync()}</li>
				<li>{m.privacy_useRankings()}</li>
				<li>{m.privacy_useProfile()}</li>
			</ul>
		</section>

		<section>
			<h2>{m.privacy_thirdPartyTitle()}</h2>
			<p>{m.privacy_thirdPartyText()}</p>
		</section>

		<section>
			<h2>{m.privacy_dataStorageTitle()}</h2>
			<p>{m.privacy_dataStorageText()}</p>
		</section>

		<section>
			<h2>{m.privacy_dataDeletionTitle()}</h2>
			<p>{m.privacy_dataDeletionText()}</p>
		</section>

		<section>
			<h2>{m.privacy_contactTitle()}</h2>
			<p>{m.privacy_contactText()}</p>
		</section>
	</div>
</main>

<style>
	.privacy-page {
		min-height: 100vh;
		background: var(--background);
		color: var(--foreground);
		padding: 2rem 1rem;
	}

	.container {
		max-width: 700px;
		margin: 0 auto;
	}

	.back-link {
		color: var(--primary);
		text-decoration: none;
		font-size: 0.9rem;
		display: inline-block;
		margin-bottom: 1.5rem;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}

	.last-updated {
		color: var(--muted-foreground);
		font-size: 0.85rem;
		margin: 0 0 2rem;
	}

	section {
		margin-bottom: 1.5rem;
	}

	h2 {
		font-size: 1.15rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
	}

	p {
		color: var(--muted-foreground);
		line-height: 1.6;
		margin: 0 0 0.5rem;
	}

	ul {
		color: var(--muted-foreground);
		line-height: 1.6;
		padding-left: 1.25rem;
		margin: 0;
	}

	li {
		margin-bottom: 0.25rem;
	}
</style>
