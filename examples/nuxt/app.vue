<template>
  <div dir="rtl" lang="ar">
    <h1>العرض والمصمم</h1>
    <ClientOnly>
      <Demo />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import Demo from './demo.vue';

useHead({
  title: 'العرض والمصمم',
  htmlAttrs: { lang: 'ar', dir: 'rtl' },
});
</script>
