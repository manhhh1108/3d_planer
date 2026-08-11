<script>
  import '../app.css';
  import { browser } from '$app/environment';
  import { themePreference } from '$lib/stores/theme';
  let { children } = $props();
</script>

{@render children()}
