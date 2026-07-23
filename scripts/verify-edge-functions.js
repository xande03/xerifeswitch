#!/usr/bin/env node

/**
 * Script de Verificação Automática das Edge Functions
 * Testa se youtube-general-search aceita sort=date e outras funcionalidades críticas
 */

const SUPABASE_URL = 'https://hvslfbcsokurljstmtip.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2c2xmYmNzb2t1cmxqc3RtdGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2NzI5MjcsImV4cCI6MjA2MTI0ODkyN30.NZhv8qRZqI3jYKZCJXVqCHpLfNg5UKxq0zH3L7-1KBs';

/**
 * Testa a Edge Function youtube-general-search com sort=date
 */
async function testYouTubeGeneralSearchSortDate() {
  console.log('🔍 Testando youtube-general-search com sort=date...');
  
  try {
    const params = new URLSearchParams({
      q: 'música brasileira',
      sort: 'date'
    });
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/youtube-general-search?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Verificações específicas
    const checks = {
      hasResults: data.results && data.results.length > 0,
      hasValidStructure: data.results && data.results[0] && data.results[0].title,
      hasVideoIds: data.results && data.results.every(r => r.videoId)
    };

    console.log('✅ Resposta recebida:');
    console.log(`   • Resultados: ${checks.hasResults ? data.results.length : 0} itens`);
    console.log(`   • Estrutura válida: ${checks.hasValidStructure ? '✅ OK' : '❌ ERRO'}`);
    console.log(`   • Sort by date: ✅ PARÂMETRO ENVIADO`);
    
    if (checks.hasResults) {
      console.log(`   • Primeiro resultado: ${data.results[0].title}`);
      console.log(`   • Canal: ${data.results[0].channel}`);
      console.log(`   • Publicado: ${data.results[0].publishedTime}`);
    }

    if (checks.hasResults && checks.hasValidStructure) {
      console.log('🎉 youtube-general-search com sort=date está FUNCIONANDO!');
      return true;
    } else {
      console.log('⚠️  Funcionalidade sort=date retornou sem resultados');
      return false;
    }

  } catch (error) {
    console.error('❌ Erro ao testar youtube-general-search:', error.message);
    return false;
  }
}

/**
 * Testa funcionalidade básica (sem sort)
 */
async function testYouTubeGeneralSearchBasic() {
  console.log('🔍 Testando youtube-general-search básico...');
  
  try {
    const params = new URLSearchParams({
      q: 'teste música'
    });
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/youtube-general-search?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      console.log('✅ Funcionalidade básica está funcionando');
      console.log(`   • Resultados: ${data.results.length} itens`);
      console.log(`   • Primeiro resultado: ${data.results[0].title}`);
      return true;
    } else {
      console.log('❌ Funcionalidade básica com problemas - sem resultados');
      return false;
    }

  } catch (error) {
    console.error('❌ Erro ao testar funcionalidade básica:', error.message);
    return false;
  }
}

/**
 * Testa múltiplas Edge Functions críticas
 */
async function testCriticalFunctions() {
  console.log('🔍 Testando outras Edge Functions críticas...');
  
  const tests = [
    {
      name: 'youtube-search',
      payload: { query: 'test music', limit: 3 }
    },
    {
      name: 'youtube-video-info', 
      payload: { videoId: 'dQw4w9WgXcQ' }
    },
    {
      name: 'ai-chat',
      payload: { message: 'test', conversationId: 'test-' + Date.now() }
    }
  ];

  const results = {};

  for (const test of tests) {
    try {
      console.log(`   • Testando ${test.name}...`);
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/${test.name}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(test.payload)
      });

      results[test.name] = {
        status: response.status,
        ok: response.ok,
        message: response.ok ? 'OK' : response.statusText
      };

      console.log(`     ${response.ok ? '✅' : '❌'} ${test.name}: ${response.status}`);

    } catch (error) {
      results[test.name] = {
        status: 0,
        ok: false,
        message: error.message
      };
      console.log(`     ❌ ${test.name}: ERRO - ${error.message}`);
    }
  }

  return results;
}

/**
 * Verificação completa do sistema
 */
async function runFullVerification() {
  console.log('🚀 VERIFICAÇÃO AUTOMÁTICA DAS EDGE FUNCTIONS');
  console.log('=' .repeat(50));
  console.log(`⏰ Iniciado em: ${new Date().toLocaleString('pt-BR')}`);
  console.log('');

  // Testes principais
  const basicTest = await testYouTubeGeneralSearchBasic();
  console.log('');
  
  const sortDateTest = await testYouTubeGeneralSearchSortDate();
  console.log('');

  const criticalTests = await testCriticalFunctions();
  console.log('');

  // Resumo final
  console.log('📊 RESUMO DA VERIFICAÇÃO:');
  console.log('-'.repeat(30));
  console.log(`youtube-general-search (básico):  ${basicTest ? '✅ OK' : '❌ ERRO'}`);
  console.log(`youtube-general-search (sort=date): ${sortDateTest ? '✅ OK' : '❌ ERRO'}`);
  
  Object.entries(criticalTests).forEach(([name, result]) => {
    console.log(`${name.padEnd(25)}: ${result.ok ? '✅ OK' : '❌ ERRO'} (${result.status})`);
  });

  console.log('');
  
  // Status final
  const allPassed = basicTest && sortDateTest && Object.values(criticalTests).every(r => r.ok);
  
  if (allPassed) {
    console.log('🎉 TODAS AS VERIFICAÇÕES PASSARAM!');
    console.log('✅ O sistema está pronto para uso com sort=date');
  } else {
    console.log('⚠️  ALGUMAS VERIFICAÇÕES FALHARAM');
    console.log('❌ Recomenda-se verificar os logs e refazer deploy');
  }

  console.log('');
  console.log(`⏰ Finalizado em: ${new Date().toLocaleString('pt-BR')}`);
  
  return allPassed;
}

// Executar verificação se script foi chamado diretamente
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Executar verificação automaticamente
runFullVerification()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });

export {
  testYouTubeGeneralSearchSortDate,
  testYouTubeGeneralSearchBasic,
  testCriticalFunctions,
  runFullVerification
};