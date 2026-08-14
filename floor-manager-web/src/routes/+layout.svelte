<script>
  import '../app.css';
  import { browser } from '$app/environment';
  import { themePreference } from '$lib/stores/theme';
  import { currentUser } from '$lib/stores/auth';

  let { children, data } = $props();

  $effect(() => {
    currentUser.set(data.user ?? null);
  });
</script>

{@render children()}
