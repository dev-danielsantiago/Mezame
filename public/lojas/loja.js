document.addEventListener('DOMContentLoaded', () => {
    let username = localStorage.getItem('username');

    if (!username || username === "") {
        console.error("Erro: nome de usuário não encontrado no localStorage.");
        alert("Erro ao recuperar o nome de usuário. Faça login novamente.");
        return;
    }

    console.log('Username:', username);

    const saldoDiv = document.getElementById('saldo');
    const itensContainer = document.getElementById('itens');
    const inventarioDiv = document.getElementById('inventario');
    const lojaNome = document.body.getAttribute('data-loja'); // Pega o nome da loja a partir do data-loja do body
    const somMoeda = document.getElementById('somMoeda');

    // Função para tocar o som de moeda
    function tocarMoeda() {
        somMoeda.play();
        console.log('Som de moeda tocado');
    }

    // Função para atualizar o saldo do jogador
    async function atualizarSaldo() {
        try {
            const response = await fetch(`/get-saldo?username=${encodeURIComponent(username)}`);
            const data = await response.json();
            if (data.saldo !== undefined) {
                const saldoAtualizado = parseFloat(data.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                saldoDiv.innerText = `Dracmas: $${saldoAtualizado}`;
            }
        } catch (error) {
            console.error('Erro ao carregar saldo:', error);
        }
    }

    // Função para carregar os itens da loja
    async function carregarItensLoja() {
        try {
            // A loja correta será carregada com base no data-loja
            const response = await fetch(`/lojas/data/${lojaNome}.json`);
            const data = await response.json();

            if (data.itens) {
                data.itens.forEach(item => {
                    const itemCard = document.createElement('li');
                    itemCard.classList.add('item');

                    const valorFormatado = item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

                    itemCard.innerHTML = `
                        <img src="${item.imagem}" alt="${item.nome}" class="cardImg">
                        <h3>${item.nome}</h3>
                        <p class="quantidade-container">Disponível: <span class="quantidade">${item.quantidade}</span></p>
                        <span class="quantidade-container quantidade">Material: ${item.material}</span>

                        <div class="card-content">
                            <p><strong>Descrição:</strong> ${item.descricao}</p>
                            <p><strong>Informações:</strong> ${item.efeito}</p>
                        </div>

                        <div class="saiba-comprar">
                            <button class="saiba-mais-btn">Saiba Mais</button>
                            <div class="comprar-quantidade">
                                <input type="number" class="quantidade-compra" min="1" max="${item.quantidade}" value="1" ${item.quantidade <= 0 ? 'disabled' : ''}>
                                <button class="comprar-btn" data-nome="${item.nome}" data-preco="${item.valor}" ${item.quantidade <= 0 ? 'disabled' : ''}>
                                    ${item.quantidade > 0 ? `Comprar ${valorFormatado}` : 'Esgotado'}
                                </button>
                            </div>
                        </div>
                    `;

                    itemCard.querySelector('.saiba-mais-btn').addEventListener('click', function() {
                        const content = this.parentElement.previousElementSibling;
                        if (content.classList.contains('open')) {
                            content.classList.remove('open');
                            this.textContent = 'Saiba Mais';
                        } else {
                            content.classList.add('open');
                            this.textContent = 'Mostrar Menos';
                        }
                    });

                    const quantidadeInput = itemCard.querySelector('.quantidade-compra');
                    const compraBtn = itemCard.querySelector('.comprar-btn');

                    quantidadeInput.addEventListener('input', function() {
                        const quantidade = parseInt(this.value, 10);
                        const valorUnitario = parseFloat(item.valor);

                        if (!isNaN(quantidade) && quantidade > 0 && quantidade <= item.quantidade) {
                            const valorTotal = quantidade * valorUnitario;
                            const valorFormatado = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            compraBtn.textContent = `Comprar ${valorFormatado}`;
                        } else {
                            compraBtn.textContent = 'Quantidade inválida';
                        }
                    });

                    compraBtn.addEventListener('click', () => {
                        const quantidade = parseInt(quantidadeInput.value);
                        if (quantidade > 0 && quantidade <= item.quantidade) {
                            comprarItem(item.nome, item.valor * quantidade, quantidade, itemCard);
                        } else {
                            alert('Quantidade inválida!');
                        }
                    });

                    itensContainer.appendChild(itemCard);
                });
            } else {
                document.querySelector('#itens').innerHTML = '<p>Não há itens disponíveis.</p>';
            }
        } catch (error) {
            console.error('Erro ao carregar itens da loja:', error);
        }
    }

    // Função para realizar a compra de um item
    async function comprarItem(nome, valorTotal, quantidade, itemCard) {
        try {
            const response = await fetch('/comprar-item', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    nome,
                    valor: valorTotal,
                    quantidade,
                    loja: lojaNome,
                    origem: 'comprado' 
                })
            });

            const result = await response.json();

            if (result.success) {
                tocarMoeda();
                alert(`Compra de ${quantidade}x ${nome} realizada com sucesso!`);

                await atualizarSaldo();

                const quantidadeElement = itemCard.querySelector('.quantidade');
                let quantidadeAtual = parseInt(quantidadeElement.textContent);

                if (!isNaN(quantidadeAtual)) {
                    const novaQuantidade = quantidadeAtual - quantidade;
                    quantidadeElement.textContent = novaQuantidade;

                    if (novaQuantidade <= 0) {
                        const compraBtn = itemCard.querySelector('.comprar-btn');
                        compraBtn.disabled = true;
                        compraBtn.textContent = 'Esgotado';
                    }
                }
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error('Erro ao realizar compra:', error);
        }
    }

    atualizarSaldo();
    carregarItensLoja(); // Carrega os itens da loja específica com base no data-loja
     // Função para carregar o inventário do jogador, diferenciando presentes e compras
     async function carregarInventario() {
        try {
            const response = await fetch(`/get-inventario/${encodeURIComponent(username)}`);
            const data = await response.json();

            if (data.presentes && data.presentes.length > 0) {
                inventarioDiv.innerHTML = '';
                data.presentes.forEach((presente, index) => {
                    const card = document.createElement('div');
                    card.classList.add('card');
                    card.setAttribute('data-index', index);

                    // Verifica a origem do item, se é presente ou comprado
                    let tipoItem = 'Desconhecido';
                    if (presente.origem) {
                        tipoItem = presente.origem === 'presente' ? 'Presente' : 'Comprado na Loja';
                    } else {
                        // Se o campo origem não existir, vamos assumir como comprado
                        tipoItem = 'Comprado na Loja';
                    }

                    card.innerHTML = `
                        <h3>${tipoItem}: ${presente.tipoCaixa ? presente.tipoCaixa : presente.nome}</h3>
                        <p>Item: ${presente.item || presente.nome}</p>
                        <p>${presente.descricao}</p>
                        <img src="${presente.imagem}" alt="${presente.item || presente.nome}">
                        <button class="delete-btn">Excluir</button>
                    `;

                    const deleteButton = card.querySelector('.delete-btn');
                    deleteButton.addEventListener('click', function () {
                        deletarItem(index);
                    });

                    inventarioDiv.appendChild(card);
                });
            } else {
                inventarioDiv.innerHTML = '<p>Você ainda não possui itens no inventário.</p>';
            }
        } catch (error) {
            console.error('Erro ao carregar inventário:', error);
        }
    }

    async function deletarItem(index) {
        try {
            const response = await fetch(`/deletar-item/${encodeURIComponent(username)}/${index}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                carregarInventario();
            } else {
                alert('Erro ao deletar item.');
            }
        } catch (error) {
            console.error('Erro ao deletar item:', error);
        }
    }
});

