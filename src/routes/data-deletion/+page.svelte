<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
</script>

<svelte:head>
	<title>Scorekinole - {m.deletion_title()}</title>
</svelte:head>

<main class="deletion-page">
	<div class="container">
		<a href="/" class="back-link">&larr; {m.common_back()}</a>

		<h1>{m.deletion_title()}</h1>
		<p class="intro">{m.deletion_intro()}</p>

		<section>
			<h2>{m.deletion_whatWeDeleteTitle()}</h2>
			<ul>
				<li>{m.deletion_deleteProfile()}</li>
				<li>{m.deletion_deleteStats()}</li>
				<li>{m.deletion_deleteTournaments()}</li>
				<li>{m.deletion_deleteAvatar()}</li>
			</ul>
		</section>

		<section>
			<h2>{m.deletion_howToTitle()}</h2>
			<ol>
				<li>{m.deletion_howToStep1()}</li>
				<li>{m.deletion_howToStep2()}</li>
				<li>{m.deletion_howToStep3()}</li>
			</ol>
		</section>

		<section>
			<h2>{m.deletion_localDataTitle()}</h2>
			<p>{m.deletion_localDataText()}</p>
		</section>
	</div>
</main>

<style>
	.deletion-page {
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

	.intro {
		color: var(--muted-foreground);
		line-height: 1.6;
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

	ul, ol {
		color: var(--muted-foreground);
		line-height: 1.8;
		padding-left: 1.25rem;
		margin: 0;
	}

	li {
		margin-bottom: 0.25rem;
	}
</style>
