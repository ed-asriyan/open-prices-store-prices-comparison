<script>
  import { Loader2, AlertCircle } from 'lucide-svelte';

  export let status = { isLoading: false, text: '', error: null };
</script>

{#if status.isLoading}
  <div class="flex items-center justify-center p-8 text-blue-600 bg-blue-50/50 rounded-2xl border border-blue-100">
    <Loader2 class="w-6 h-6 animate-spin mr-3" />
    <span class="font-medium animate-pulse">{status.text}</span>
  </div>
{/if}

{#if status.error}
  <div class="flex items-center p-4 text-red-700 bg-red-50 rounded-2xl border border-red-100">
    <AlertCircle class="w-5 h-5 mr-3 shrink-0" />
    <span class="font-medium">{status.error}</span>
  </div>
{/if}
