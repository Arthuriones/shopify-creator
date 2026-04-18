/**
 * Before After Slider Functionality
 * Optimized for Shopify theme customizer performance
 */
function initializeBeforeAfterSlider(uniqueId) {
  // Verificar se o uniqueId foi fornecido
  if (!uniqueId) {
    console.warn('Before After Slider: uniqueId não fornecido');
    return;
  }

  // Aguardar o DOM estar pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setupSlider(uniqueId);
    });
  } else {
    setupSlider(uniqueId);
  }
}

function setupSlider(uniqueId) {
  const container = document.querySelector(`.${uniqueId} .before_after`);
  const slider = document.querySelector(`.${uniqueId} .ba-slider`);

  // Verificar se os elementos existem
  if (!container || !slider) {
    console.warn('Before After Slider: Elementos não encontrados para', uniqueId);
    return;
  }

  // Remover listener anterior se existir (para evitar duplicação)
  slider.removeEventListener('input', handleSliderInput);
  
  // Função para lidar com o input do slider
  function handleSliderInput(e) {
    const value = e.target.value;
    container.style.setProperty('--position', `${value}%`);
  }

  // Adicionar event listener
  slider.addEventListener('input', handleSliderInput);
  
  // Configurar valor inicial
  container.style.setProperty('--position', '50%');
}

// Função para limpar listeners (útil para o theme customizer)
function cleanupBeforeAfterSlider(uniqueId) {
  if (!uniqueId) return;
  
  const slider = document.querySelector(`.${uniqueId} .ba-slider`);
  if (slider) {
    slider.removeEventListener('input', handleSliderInput);
  }
}


