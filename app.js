const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();
const port = 3000;
const multer = require('multer');
const path = require('path');
const cors = require('cors');

app.use(cors({
    origin: 'http://localhost:3000'  // Substitua com a origem correta
}));


app.use(cors()); // Permite requisições de qualquer origem

app.use(express.json()); // Para processar JSON no corpo da requisição
const dns = require('dns');
const { v4: uuidv4 } = require('uuid');

app.use(bodyParser.json());
app.use(express.static('public'));

// Middleware para definir a política de segurança de conteúdo
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
    next();
});

// Inicia o servidor na porta 3000
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
// Rota para a página de login
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

// Rota para o painel do Mestre (acessível após login)
app.get('/mestre.html', (req, res) => {
    res.sendFile(__dirname + '/public/mestre.html'); // Verifique se o caminho para o arquivo está correto
});

// Rota para login
app.post('/login', (req, res) => {
    const { username, senha } = req.body;

    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados.' });
        }

        const players = JSON.parse(data).jogadores;
        const player = players.find(p => p.username === username && p.senha === senha);

        if (player) {
            if (player.username === 'Mestre') {
                return res.status(200).json({ message: 'Login bem-sucedido!', saldo: player.saldo, isMestre: true });
            }
            return res.status(200).json({ message: 'Login bem-sucedido!', saldo: player.saldo });
        } else {
            return res.status(401).json({ message: 'Usuário ou senha incorretos.' });
        }
    });
});

// Rota para buscar o saldo de todos os jogadores, ordenado pelo saldo
app.get('/saldo-jogadores', (req, res) => {
    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados.' });
        }

        const players = JSON.parse(data).jogadores;

        // Ordena os jogadores por saldo, do maior para o menor
        players.sort((a, b) => (b.saldo || 0) - (a.saldo || 0));

        res.json(players); // Retorna a lista de jogadores e seus saldos ordenados
    });
});

// Rota para modificar o saldo de um jogador
app.post('/modificar-saldo', (req, res) => {
    const { jogador, valor, acao } = req.body;

    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados.' });
        }

        const players = JSON.parse(data).jogadores;
        const player = players.find(p => p.username === jogador);

        if (player) {
            if (acao === 'aumentar') {
                player.saldo += valor; // Aumenta o saldo
            } else if (acao === 'diminuir' && player.saldo >= valor) {
                player.saldo -= valor; // Diminui o saldo, se o jogador tiver saldo suficiente
            } else {
                return res.status(400).json({ message: 'Saldo insuficiente para a operação.' });
            }

            // Atualiza o arquivo players.json com o novo saldo
            fs.writeFile('data/players.json', JSON.stringify({ jogadores: players }, null, 2), (err) => {
                if (err) {
                    return res.status(500).json({ message: 'Erro ao salvar os dados.' });
                }
                res.json({ message: 'Saldo modificado com sucesso!' });
            });
        } else {
            return res.status(404).json({ message: 'Jogador não encontrado.' });
        }
    });
});



// Rota para transferir dinheiro entre jogadores
app.post('/transfer', (req, res) => {
    const { destinatario, valor, username } = req.body;

    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados.' });
        }

        const players = JSON.parse(data).jogadores;
        const jogadorOrigem = players.find(p => p.username === username);
        const jogadorDestino = players.find(p => p.username === destinatario);

        if (!jogadorOrigem || !jogadorDestino) {
            return res.status(404).json({ message: 'Jogador origem ou destinatário não encontrado.' });
        }

        const valorNumerico = Number(valor);
        if (isNaN(valorNumerico) || valorNumerico <= 0) {
            return res.status(400).json({ message: 'Valor inválido.' });
        }

        if (jogadorOrigem.username === jogadorDestino.username) {
            return res.status(400).json({ message: 'Você não pode transferir dinheiro para si mesmo.' });
        }

        if (jogadorOrigem.saldo < valorNumerico) {
            return res.status(400).json({ message: 'Saldo insuficiente para a transferência.' });
        }

        // Realizar a transferência
        jogadorOrigem.saldo -= valorNumerico;
        jogadorDestino.saldo += valorNumerico;

        // Atualizar o arquivo JSON
        fs.writeFile('data/players.json', JSON.stringify({ jogadores: players }), (err) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao atualizar os dados.' });
            }

            // Registrar a transação após a atualização
            registrarTransacao(jogadorOrigem.username, jogadorDestino.username, valorNumerico, res);
        });
    });
});

// Função para registrar transações
function registrarTransacao(remetente, destinatario, valor, res) {
    fs.readFile('data/transacoes.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados das transações.' });
        }

        const transacoes = JSON.parse(data || '{"transacoes": []}').transacoes;
        transacoes.push({ remetente, destinatario, valor: Number(valor), data: new Date().toISOString() });

        fs.writeFile('data/transacoes.json', JSON.stringify({ transacoes }), (err) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao atualizar os dados das transações.' });
            }

            return res.status(200).json({ message: 'Transferência e transação com sucesso!' });
        });
    });
}

// ** Rota para obter as transações **
app.get('/transacoes', (req, res) => {
    fs.readFile('data/transacoes.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler as transações.' });
        }

        const transacoes = JSON.parse(data).transacoes;
        return res.status(200).json(transacoes);
    });
});

// Rota para obter o saldo do jogador logado
app.get('/get-saldo', (req, res) => {
    const username = req.query.username; // Captura o username da query string

    if (!username) {
        return res.status(400).json({ message: 'Nome de usuário não fornecido.' });
    }

    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) {
            console.error('Erro ao ler o arquivo players.json:', err);
            return res.status(500).json({ message: 'Erro ao ler os dados.' });
        }

        try {
            const players = JSON.parse(data).jogadores;
            const player = players.find(p => p.username === username);

            if (player) {
                console.log(`Saldo do jogador ${username}: ${player.saldo}`);
                return res.status(200).json({ saldo: player.saldo });
            } else {
                console.log(`Jogador ${username} não encontrado.`);
                return res.status(404).json({ message: 'Jogador não encontrado.' });
            }
        } catch (parseError) {
            console.error('Erro ao processar players.json:', parseError);
            return res.status(500).json({ message: 'Erro ao processar os dados.' });
        }
    });
});



// ========================================COMEÇO APOSTAS=========================================================//


// Limites e multiplicadores
const APOSTAS_MAX_DIARIAS = 10; // Limite máximo de apostas por dia
const MULTIPLICADOR_NORMAL = 2.5; // Multiplicador padrão para dias normais
const MULTIPLICADOR_FINAL_SEMANA = 3.5; // Multiplicador para finais de semana
const MULTIPLICADOR_PERDA = 1.5; // Multiplicador fixo para a perda

// Função para verificar se é final de semana
function isFinalDeSemana() {
    const hoje = new Date();
    const diaSemana = hoje.getDay();
    return diaSemana === 6 || diaSemana === 0; // 6 = Sábado, 0 = Domingo
}

// Enviar multiplicadores para o front
app.get('/get-multiplicadores', (req, res) => {
    const multiplicadorGanho = isFinalDeSemana() ? MULTIPLICADOR_FINAL_SEMANA : MULTIPLICADOR_NORMAL;
    const multiplicadorPerda = MULTIPLICADOR_PERDA; // Multiplicador fixo de perda
    
    res.json({
        multiplicadorGanho,
        multiplicadorPerda
    });
});

// Rota para obter o número de apostas diárias do usuário
app.get('/get-apostas', (req, res) => {
    const username = req.query.username;

    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados dos jogadores.' });
        }

        const players = JSON.parse(data).jogadores;
        const player = players.find(p => p.username === username);

        if (!player) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }

        const hoje = new Date().toDateString(); // Obtém a data atual
        const dataUltimaAposta = player.dataUltimaAposta || '';
        let apostasHoje = player.apostasHoje || 0;

        // Reseta as apostas diárias se for um novo dia
        if (dataUltimaAposta !== hoje) {
            apostasHoje = 0; // Novo dia, reinicia contagem
        }

        return res.status(200).json({ success: true, apostasHoje });
    });
});

// Rota para processar apostas do Jokenpo
app.post('/apostar', (req, res) => {
    const { username, valorAposta, jogada, jogadaComputador, resultado, ganho } = req.body;

    // Ler o arquivo players.json
    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados dos jogadores.' });
        }

        const players = JSON.parse(data).jogadores;
        const player = players.find(p => p.username === username);
        const mestre = players.find(p => p.username === 'Mestre');

        if (!player || !mestre) {
            return res.status(404).json({ success: false, message: 'Usuário ou mestre não encontrado.' });
        }

        const hoje = new Date().toDateString(); // Obtém a data atual
        const dataUltimaAposta = player.dataUltimaAposta || '';
        let apostasHoje = player.apostasHoje || 0;

        // Reseta as apostas diárias se for um novo dia
        if (dataUltimaAposta !== hoje) {
            apostasHoje = 0; // Novo dia, reinicia contagem
        }

        // Verifica se o jogador já atingiu o limite de apostas diárias
        if (apostasHoje >= APOSTAS_MAX_DIARIAS) {
            return res.status(400).json({ success: false, message: 'Limite de apostas diárias atingido.' });
        }

        const valorApostaNumerico = Number(valorAposta);
        if (isNaN(valorApostaNumerico) || valorApostaNumerico <= 0) {
            return res.status(400).json({ success: false, message: 'Valor de aposta inválido.' });
        }

        if (player.saldo < valorApostaNumerico) {
            return res.status(400).json({ success: false, message: 'Saldo insuficiente para a aposta.' });
        }

        // Verifica se é final de semana para aplicar o multiplicador correto
        const multiplicadorGanho = isFinalDeSemana() ? MULTIPLICADOR_FINAL_SEMANA : MULTIPLICADOR_NORMAL;

        // Processar a aposta
        let valorGanho = 0;
        if (resultado === 'ganhou') {
            valorGanho = valorApostaNumerico * multiplicadorGanho; // Aplica o multiplicador correto
            player.saldo += valorGanho;
        } else if (resultado === 'perdeu') {
            const valorPerdido = valorApostaNumerico * MULTIPLICADOR_PERDA; // Aplica o multiplicador de perda
            player.saldo -= valorPerdido;
        }

        // Atualiza o número de apostas diárias e a data da última aposta
        apostasHoje++;
        player.apostasHoje = apostasHoje;
        player.dataUltimaAposta = hoje;

        // Atualizar o arquivo JSON com os novos saldos e número de apostas
        fs.writeFile('data/players.json', JSON.stringify({ jogadores: players }), (err) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao atualizar o saldo.' });
            }

            return res.status(200).json({
                success: true,
                message: 'Aposta processada com sucesso!',
                saldo: player.saldo,
                jogadaJogador: jogada,
                jogadaComputador,
                resultado
            });
        });
    });
});

// ========================================FIM APOSTAS=========================================================//


// Rota para enviar presente e sortear item
app.post('/enviar-presente', (req, res) => {
    const { remetente, destinatario, tipoCaixa } = req.body;
    console.log(`Requisição recebida. Remetente: ${remetente}, Destinatário: ${destinatario}, Tipo da Caixa: ${tipoCaixa}`);

    try {
        fs.readFile('data/players.json', 'utf8', (err, data) => {
            if (err) {
                console.error('Erro ao ler players.json:', err);
                return res.status(500).json({ message: 'Erro ao ler os dados dos jogadores.' });
            }

            const players = JSON.parse(data).jogadores;
            const playerRemetente = players.find(p => p.username === remetente);
            const playerDestinatario = players.find(p => p.username === destinatario);

            if (!playerRemetente || !playerDestinatario) {
                console.error('Remetente ou destinatário não encontrado.');
                return res.status(404).json({ message: 'Remetente ou destinatário não encontrado.' });
            }

            // Determinar o custo da caixa
            let custoCaixa = 0;
            if (tipoCaixa === 'normal') custoCaixa = 100;
            else if (tipoCaixa === 'superior') custoCaixa = 200;
            else if (tipoCaixa === 'lenda') custoCaixa = 300;

            if (playerRemetente.saldo < custoCaixa) {
                console.error('Saldo insuficiente.');
                return res.status(400).json({ message: 'Saldo insuficiente.' });
            }

            playerRemetente.saldo -= custoCaixa;

            // Atualizar o saldo do remetente
            fs.writeFile('data/players.json', JSON.stringify({ jogadores: players }, null, 2), (err) => {
                if (err) {
                    console.error('Erro ao atualizar saldo no players.json:', err);
                    return res.status(500).json({ message: 'Erro ao atualizar saldo.' });
                }

                // Ler o arquivo de itens para sortear um item
                fs.readFile('data/itens.json', 'utf8', (err, data) => {
                    if (err) {
                        console.error('Erro ao ler itens.json:', err);
                        return res.status(500).json({ message: 'Erro ao ler os itens.' });
                    }

                    const itens = JSON.parse(data).itens;

                    // Separar os itens por tipo
                    const itensComuns = itens.filter(i => i.tipo === 'Comum');
                    const itensIncomuns = itens.filter(i => i.tipo === 'Incomum');
                    const itensLendarios = itens.filter(i => i.tipo === 'Lendário');

                    let tipoSorteado;
                    const probabilidade = Math.random() * 100;

                    // Determinar tipo do item com base na caixa e probabilidades
                    if (tipoCaixa === 'normal') {
                        if (probabilidade <= 80) tipoSorteado = 'Comum';
                        else if (probabilidade <= 95) tipoSorteado = 'Incomum';
                        else tipoSorteado = 'Lendário';
                    } else if (tipoCaixa === 'superior') {
                        if (probabilidade <= 50) tipoSorteado = 'Comum';
                        else if (probabilidade <= 85) tipoSorteado = 'Incomum';
                        else tipoSorteado = 'Lendário';
                    } else if (tipoCaixa === 'lenda') {
                        if (probabilidade <= 20) tipoSorteado = 'Comum';
                        else if (probabilidade <= 50) tipoSorteado = 'Incomum';
                        else tipoSorteado = 'Lendário';
                    }

                    let itemSorteado;
                    if (tipoSorteado === 'Comum') {
                        itemSorteado = itensComuns[Math.floor(Math.random() * itensComuns.length)];
                    } else if (tipoSorteado === 'Incomum') {
                        itemSorteado = itensIncomuns[Math.floor(Math.random() * itensIncomuns.length)];
                    } else if (tipoSorteado === 'Lendário') {
                        itemSorteado = itensLendarios[Math.floor(Math.random() * itensLendarios.length)];
                    }

                    if (!itemSorteado) {
                        console.error('Erro ao sortear o item.');
                        return res.status(500).json({ message: 'Erro ao sortear o item.' });
                    }

                    // Atualizar o inventário do destinatário
                    fs.readFile('data/inventario.json', 'utf8', (err, data) => {
                        if (err) {
                            console.error('Erro ao ler inventario.json:', err);
                            return res.status(500).json({ message: 'Erro ao ler o inventário.' });
                        }

                        const inventarios = JSON.parse(data).inventarios;
                        let inventarioDestinatario = inventarios.find(i => i.username === destinatario);

                        if (!inventarioDestinatario) {
                            inventarioDestinatario = { username: destinatario, presentes: [] };
                            inventarios.push(inventarioDestinatario);
                        }

                        inventarioDestinatario.presentes.push({
                            tipoCaixa,
                            item: itemSorteado.nome,
                            descricao: itemSorteado.descricao,
                            imagem: itemSorteado.imagem
                        });

                        fs.writeFile('data/inventario.json', JSON.stringify({ inventarios }, null, 2), (err) => {
                            if (err) {
                                console.error('Erro ao atualizar inventario.json:', err);
                                return res.status(500).json({ message: 'Erro ao atualizar inventário.' });
                            }

                            console.log('Inventário atualizado com sucesso');

                            // Adicionar notificação para o destinatário
                            fs.readFile('data/notificacoes.json', 'utf8', (err, data) => {
                                if (err) {
                                    console.error('Erro ao ler notificacoes.json:', err);
                                    return res.status(500).json({ message: 'Erro ao ler as notificações.' });
                                }

                                const notificacoes = JSON.parse(data).notificacoes || [];

                                const novaNotificacao = {
                                    remetente: playerRemetente.username,
                                    destinatario: playerDestinatario.username,
                                    tipoCaixa,
                                    mensagem: `Você recebeu um presente de ${playerRemetente.username}: Caixa ${tipoCaixa}`,
                                    item: itemSorteado.nome
                                };

                                console.log('Notificação criada:', novaNotificacao);

                                notificacoes.push(novaNotificacao);

                                fs.writeFile('data/notificacoes.json', JSON.stringify({ notificacoes }, null, 2), (err) => {
                                    if (err) {
                                        console.error('Erro ao salvar notificação:', err);
                                        return res.status(500).json({ message: 'Erro ao salvar notificação.' });
                                    }

                                    console.log('Notificação salva com sucesso');

                                    return res.status(200).json({
                                        message: 'Presente enviado com sucesso!',
                                        item: itemSorteado.nome,
                                        descricao: itemSorteado.descricao,
                                        imagem: itemSorteado.imagem,
                                        saldo: playerRemetente.saldo
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    } catch (error) {
        console.error('Erro inesperado ao enviar presente:', error);
        return res.status(500).json({ message: 'Erro inesperado ao enviar o presente.' });
    }
});



// Rota para obter a lista de jogadores
app.get('/get-players', (req, res) => {
    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados dos jogadores.' });
        }

        try {
            const players = JSON.parse(data).jogadores;
            return res.status(200).json({ players: players });
        } catch (parseError) {
            console.error('Erro ao processar o JSON de jogadores:', parseError);
            return res.status(500).json({ message: 'Erro ao processar os dados dos jogadores.' });
        }
    });
});


// Rota para obter notificações do jogador
app.get('/get-notificacoes', (req, res) => {
    const username = req.query.username;  // Pegando o username da query string

    // Ajustando o caminho correto para o arquivo notificacoes.json
    fs.readFile(__dirname + '/data/notificacoes.json', 'utf8', (err, data) => {
        if (err || !data) {
            console.error('Erro ao ler notificacoes.json:', err);
            return res.status(500).json({ message: 'Erro ao ler as notificações.' });
        }

        try {
            const notificacoes = JSON.parse(data).notificacoes || [];
            const notificacoesUsuario = notificacoes.filter(n => n.destinatario === username);

            return res.status(200).json(notificacoesUsuario);
        } catch (parseError) {
            console.error('Erro ao processar o JSON de notificações:', parseError);
            return res.status(500).json({ message: 'Erro ao processar notificações.' });
        }
    });
});


// Rota para limpar notificações de um jogador específico
app.delete('/limpar-notificacoes', (req, res) => {
    const username = req.query.username;

    fs.readFile('data/notificacoes.json', 'utf8', (err, data) => {
        if (err || !data) {
            console.error('Erro ao ler notificacoes.json:', err);
            return res.status(500).json({ message: 'Erro ao ler as notificações.' });
        }

        try {
            let notificacoes = JSON.parse(data).notificacoes || [];

            // Filtrar notificações que não pertencem ao usuário
            notificacoes = notificacoes.filter(n => n.destinatario !== username);

            // Escrever as notificações filtradas de volta no arquivo
            fs.writeFile('data/notificacoes.json', JSON.stringify({ notificacoes }), (err) => {
                if (err) {
                    console.error('Erro ao salvar notificacoes.json:', err);
                    return res.status(500).json({ message: 'Erro ao salvar notificações.' });
                }

                console.log(`Notificações de ${username} excluídas com sucesso`);
                return res.status(200).json({ message: 'Notificações excluídas com sucesso' });
            });
        } catch (parseError) {
            console.error('Erro ao processar o JSON de notificações:', parseError);
            return res.status(500).json({ message: 'Erro ao processar notificações.' });
        }
    });
});

// ==================== Rota para obter o inventário de um jogador ==================== //
app.get('/get-inventario/:username', (req, res) => {
    const username = req.params.username;  // Obtendo o username dos parâmetros da URL

    fs.readFile('data/inventario.json', 'utf8', (err, data) => {
        if (err) {
            console.error('Erro ao ler inventario.json:', err);
            return res.status(500).json({ message: 'Erro ao ler o inventário.' });
        }

        try {
            const inventarios = JSON.parse(data).inventarios || [];
            const inventarioUsuario = inventarios.find(inventario => inventario.username === username);

            if (!inventarioUsuario) {
                console.log(`Inventário não encontrado para o usuário ${username}`);
                return res.status(404).json({ message: 'Inventário não encontrado para o usuário.' });
            }

            console.log(`Inventário carregado para o usuário ${username}`);
            return res.status(200).json(inventarioUsuario);
        } catch (parseError) {
            console.error('Erro ao processar o JSON do inventário:', parseError);
            return res.status(500).json({ message: 'Erro ao processar o inventário.' });
        }
    });
});

/// ==================== Rota para deletar um item do inventário ==================== //

app.delete('/deletar-item/:username/:index', (req, res) => {
    const username = req.params.username;
    const index = parseInt(req.params.index, 10); // Converte o índice para número
    
    console.log(`Tentativa de deletar o item de índice ${index} para o usuário ${username}`);

    // Verifica se o username é válido e o índice é um número
    if (!username || isNaN(index)) {
        console.error(`Requisição inválida - username: ${username}, index: ${index}`);
        return res.status(400).json({ success: false, message: 'Requisição inválida.' });
    }

    // Ler o arquivo de inventário
    fs.readFile('data/inventario.json', 'utf8', (err, data) => {
        if (err) {
            console.error('Erro ao ler inventario.json:', err);
            return res.status(500).json({ success: false, message: 'Erro ao ler o inventário.' });
        }

        try {
            const inventarios = JSON.parse(data).inventarios;
            const inventarioUsuario = inventarios.find(i => i.username === username);

            if (!inventarioUsuario) {
                console.error(`Inventário não encontrado para o usuário ${username}`);
                return res.status(404).json({ success: false, message: 'Inventário não encontrado para o usuário.' });
            }

            // Verificar se o índice é válido
            if (index < 0 || index >= inventarioUsuario.presentes.length) {
                console.error(`Índice inválido: ${index} para o usuário ${username}`);
                return res.status(400).json({ success: false, message: 'Índice inválido.' });
            }

            // Remover o item do inventário
            inventarioUsuario.presentes.splice(index, 1);

            // Atualizar o arquivo JSON
            fs.writeFile('data/inventario.json', JSON.stringify({ inventarios }, null, 2), (err) => {
                if (err) {
                    console.error('Erro ao atualizar inventario.json:', err);
                    return res.status(500).json({ success: false, message: 'Erro ao atualizar o inventário.' });
                }

                console.log(`Item de índice ${index} removido do inventário de ${username}.`);
                return res.status(200).json({ success: true });
            });
        } catch (parseError) {
            console.error('Erro ao processar inventario.json:', parseError);
            return res.status(500).json({ success: false, message: 'Erro ao processar o inventário.' });
        }
    });
});


// ========= COMPRA ITENS ==================== //

// Rota para realizar a compra de um item
app.post('/comprar-item', (req, res) => {
    const { username, nome, valor, quantidade, loja, origem } = req.body;

    // Validação simples dos dados de entrada
    if (!username || !nome || !valor || !quantidade || !loja) {
        console.error('Erro: dados incompletos para a compra:', req.body);
        return res.status(400).json({ message: 'Dados incompletos para a compra.' });
    }

    console.log(`Tentando processar compra de ${quantidade} ${nome} por ${username}. Custo total: ${valor}`);

    // Verifique o caminho da loja (exemplo: lojanecromancer.json ou lojasamurai.json)
    const lojaPath = path.join(__dirname, 'public', 'lojas', 'data', `${loja}.json`);

    // Ler o arquivo players.json para verificar o saldo do jogador
    fs.readFile(path.join(__dirname, 'data', 'players.json'), 'utf8', (err, data) => {
        if (err) {
            console.error('Erro ao ler players.json:', err);
            return res.status(500).json({ message: 'Erro ao processar compra.' });
        }

        const players = JSON.parse(data).jogadores;
        const jogador = players.find(p => p.username === username);

        if (!jogador) {
            console.error('Jogador não encontrado:', username);
            return res.status(404).json({ message: 'Jogador não encontrado.' });
        }

        console.log(`Saldo atual do jogador ${username}: ${jogador.saldo}`);

        const custoTotal = valor; // valor já é o valor total enviado do front

        if (jogador.saldo < custoTotal) {
            console.error(`Saldo insuficiente. Saldo atual: ${jogador.saldo}, custo total: ${custoTotal}`);
            return res.status(400).json({ message: 'Saldo insuficiente.' });
        }

        // Verificar se o item está disponível na loja
        fs.readFile(lojaPath, 'utf8', (err, lojaData) => {
            if (err) {
                console.error(`Erro ao ler ${loja}.json:`, err);
                return res.status(500).json({ message: 'Erro ao processar compra.' });
            }

            const lojaConteudo = JSON.parse(lojaData);
            const item = lojaConteudo.itens.find(i => i.nome === nome);

            if (!item) {
                console.error('Item não encontrado na loja:', nome);
                return res.status(404).json({ message: 'Item não encontrado na loja.' });
            }

            if (item.quantidade < quantidade) {
                console.error('Quantidade insuficiente do item. Quantidade disponível:', item.quantidade, 'Quantidade solicitada:', quantidade);
                return res.status(400).json({ message: 'Quantidade insuficiente do item.' });
            }

            // Descontar o valor do jogador e reduzir a quantidade do item
            jogador.saldo -= custoTotal;
            item.quantidade -= quantidade;

            console.log(`Compra aprovada! Novo saldo de ${username}: ${jogador.saldo}`);

            // Atualizar o arquivo da loja com a nova quantidade do item
            fs.writeFile(lojaPath, JSON.stringify(lojaConteudo, null, 2), (err) => {
                if (err) {
                    console.error(`Erro ao atualizar ${loja}.json:`, err);
                    return res.status(500).json({ message: 'Erro ao atualizar loja.' });
                }

                // Atualizar o saldo no players.json
                fs.writeFile(path.join(__dirname, 'data', 'players.json'), JSON.stringify({ jogadores: players }, null, 2), (err) => {
                    if (err) {
                        console.error('Erro ao atualizar saldo:', err);
                        return res.status(500).json({ message: 'Erro ao atualizar saldo.' });
                    }

                    // Adicionar o item comprado no inventário
                    fs.readFile(path.join(__dirname, 'data', 'inventario.json'), 'utf8', (err, invData) => {
                        if (err) {
                            console.error('Erro ao ler inventario.json:', err);
                            return res.status(500).json({ message: 'Erro ao atualizar inventário.' });
                        }

                        const inventarios = JSON.parse(invData).inventarios;
                        let inventarioUsuario = inventarios.find(i => i.username === username);

                        if (!inventarioUsuario) {
                            // Se o inventário do jogador não existir, criar um novo
                            inventarioUsuario = { username, presentes: [] };
                            inventarios.push(inventarioUsuario);
                        }

                        // Adicionar a quantidade correta de itens ao inventário do jogador
                        inventarioUsuario.presentes.push({
                            nome: item.nome,
                            descricao: item.descricao,
                            valor: item.valor,
                            imagem: item.imagem,
                            quantidade: quantidade, // Armazena a quantidade comprada
                            origem: origem || 'comprado' // Adiciona a origem como "comprado"
                        });

                        // Atualizar o arquivo de inventário
                        fs.writeFile(path.join(__dirname, 'data', 'inventario.json'), JSON.stringify({ inventarios }, null, 2), (err) => {
                            if (err) {
                                console.error('Erro ao atualizar inventário:', err);
                                return res.status(500).json({ message: 'Erro ao atualizar inventário.' });
                            }

                            console.log(`Item ${nome} adicionado ao inventário de ${username} (Quantidade: ${quantidade}, Origem: ${origem || 'comprado'}).`);
                            return res.status(200).json({ success: true, message: 'Compra realizada com sucesso!' });
                        });
                    });
                });
            });
        });
    });
});





// =============================  SALVAR FOTOS =================== //

// Configuração do multer para salvar as imagens com nomes únicos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Pasta onde as imagens serão salvas
    },
    filename: (req, file, cb) => {
        // Gera um nome único com UUID e preserva a extensão do arquivo original
        const uniqueFilename = `${uuidv4()}-${path.extname(file.originalname)}`;
        cb(null, uniqueFilename); // Salva a imagem com um nome único
    }
});

const upload = multer({ storage: storage });

// Servir a pasta de uploads como estática para que as imagens possam ser acessadas diretamente
app.use('/uploads', express.static('uploads'));

// Rota para fazer o upload da imagem
app.post('/upload-imagem', upload.single('imagem'), (req, res) => {
    const username = req.body.username;
    if (!req.file) {
        return res.status(400).json({ message: 'Nenhuma imagem enviada.' });
    }

    const imagePath = `/uploads/${req.file.filename}`; // Caminho da imagem no servidor

    // Ler o arquivo JSON de jogadores para atualizar o caminho da imagem
    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) return res.status(500).json({ message: 'Erro ao ler o arquivo de jogadores.' });

        const players = JSON.parse(data).jogadores;
        const player = players.find(p => p.username === username);

        if (player) {
            player.imagem = imagePath; // Salva o caminho da imagem no perfil do jogador

            // Atualiza o arquivo JSON com a nova imagem do jogador
            fs.writeFile('data/players.json', JSON.stringify({ jogadores: players }, null, 2), (err) => {
                if (err) return res.status(500).json({ message: 'Erro ao salvar o jogador.' });

                return res.status(200).json({ imagePath: imagePath });
            });
        } else {
            return res.status(404).json({ message: 'Jogador não encontrado.' });
        }
    });
});

// Rota para buscar a imagem de um jogador
app.get('/get-imagem', (req, res) => {
    const username = req.query.username;

    fs.readFile('data/players.json', 'utf8', (err, data) => {
        if (err) return res.status(500).json({ message: 'Erro ao ler o arquivo de jogadores.' });

        const players = JSON.parse(data).jogadores;
        const player = players.find(p => p.username === username);

        if (player && player.imagem) {
            return res.status(200).json({ imagePath: player.imagem });
        } else {
            return res.status(404).json({ message: 'Imagem não encontrada.' });
        }
    });
});
// ============================= FILM SALVAR FOTOS =================== //




// Middleware para capturar o IP e resolver DNS reverso
app.use((req, res, next) => {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const logFilePath = path.join(__dirname, 'logs', 'ip-dns-log.json');
    let logData = [];

    // Verifica se o arquivo de log já existe
    if (fs.existsSync(logFilePath)) {
        const fileData = fs.readFileSync(logFilePath, 'utf8');
        logData = JSON.parse(fileData);
    }

    // Verifica se o IP é local (loopback)
    if (clientIp === '127.0.0.1' || clientIp === '::1') {
        console.log(`IP local detectado: ${clientIp}`);

        logData.push({
            ip: clientIp,
            hostname: 'localhost',
            timestamp: new Date().toISOString()
        });

        salvarNoArquivo(logFilePath, logData);
    } else {
        // Resolve o DNS reverso (hostname) a partir do IP
        dns.reverse(clientIp, (err, hostnames) => {
            if (err) {
                console.error(`Erro ao resolver DNS para o IP: ${clientIp}`, err);
            } else if (hostnames.length > 0) {
                const hostname = hostnames[0];
                console.log(`DNS para o IP ${clientIp}: ${hostname}`);

                logData.push({
                    ip: clientIp,
                    hostname: hostname,
                    timestamp: new Date().toISOString()
                });

                salvarNoArquivo(logFilePath, logData);
            }
        });
    }

    next();
});

/// Certifique-se de que a pasta 'logs' exista
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// Função para salvar dados no arquivo JSON
function salvarNoArquivo(logFilePath, logData) {
    fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2), 'utf8');
}

// Middleware para capturar informações de dispositivo enviadas pelo cliente
app.post('/save-device-info', (req, res) => {
    const deviceInfo = req.body;

    if (!deviceInfo.larguraTela || !deviceInfo.alturaTela || !deviceInfo.tipoDispositivo) {
        return res.status(400).json({ message: 'Informações de dispositivo incompletas' });
    }

    const logFilePath = path.join(__dirname, 'logs', 'device-info-log.json');
    let logData = [];

    // Verifica se o arquivo de log já existe
    if (fs.existsSync(logFilePath)) {
        const fileData = fs.readFileSync(logFilePath, 'utf8');
        logData = JSON.parse(fileData);
    }

    // Adicionar as novas informações de dispositivo ao log
    logData.push({
        larguraTela: deviceInfo.larguraTela,
        alturaTela: deviceInfo.alturaTela,
        tipoDispositivo: deviceInfo.tipoDispositivo,
        navegador: deviceInfo.navegador,
        sistemaOperacional: deviceInfo.sistemaOperacional,
        resolucaoTela: deviceInfo.resolucaoTela,
        timestamp: new Date().toISOString()
    });

    salvarNoArquivo(logFilePath, logData);

    res.status(200).json({ message: 'Informações de dispositivo salvas com sucesso!' });
});

// Middleware para capturar o IP do cliente
app.use((req, res, next) => {
    let clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Converte IPv6 localhost para IPv4 localhost
    if (clientIp === '::1') {
        clientIp = '127.0.0.1';
    }

    console.log(`IP do cliente: ${clientIp}`);
    
    next();
});

// ** Endpoint para receber os dados de navegação **
app.post('/coletar-dados', (req, res) => {
    const dadosColetados = req.body;
    const logFilePath = path.join(__dirname, 'logs', 'dados-navegacao-log.json');
    let logData = [];

    if (fs.existsSync(logFilePath)) {
        const fileData = fs.readFileSync(logFilePath, 'utf8');
        logData = JSON.parse(fileData);
    }

    logData.push({
        ...dadosColetados,
        timestamp: new Date().toISOString()
    });

    salvarNoArquivo(logFilePath, logData);

    res.status(200).json({ message: 'Dados coletados com sucesso!' });
});

// ROTA DE RANK

// Rota para retornar o ranking combinado de saldo, vitórias e derrotas
// Rota para retornar o ranking combinado de saldo, vitórias, derrotas e conquistas desbloqueadas
app.get('/ranking', (req, res) => {
    // Caminhos absolutos para garantir que os arquivos sejam encontrados
    const playersPath = path.join(__dirname, 'data', 'players.json');
    const vitoriasPath = path.join(__dirname, 'data', 'jokenpo_vitorias.json');

    fs.readFile(playersPath, 'utf8', (err, playersData) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados dos jogadores.' });
        }

        fs.readFile(vitoriasPath, 'utf8', (err, vitoriasData) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao ler os dados de vitórias.' });
            }

            // Parse dos dados JSON
            const jogadores = JSON.parse(playersData).jogadores;
            const vitorias = JSON.parse(vitoriasData).jogadores;

            // Combina as informações de saldo, vitórias/derrotas e conquistas desbloqueadas
            const ranking = jogadores.map(jogador => {
                const vitoriaInfo = vitorias.find(v => v.username === jogador.username) || { vitorias: 0, derrotas: 0 };
                return {
                    username: jogador.username,
                    saldo: jogador.saldo || 0,
                    imagem: jogador.imagem || null, // Inclui a imagem caso esteja presente
                    vitorias: vitoriaInfo.vitorias,
                    derrotas: vitoriaInfo.derrotas,
                    conquistasDesbloqueadas: jogador.conquistasDesbloqueadas || [] // Inclui conquistas desbloqueadas
                };
            });

            // Ordena por saldo (e opcionalmente, por vitórias em caso de empate no saldo)
            ranking.sort((a, b) => {
                if (b.saldo === a.saldo) {
                    return b.vitorias - a.vitorias; // Se os saldos forem iguais, ordena por vitórias
                }
                return b.saldo - a.saldo;
            });

            // Retorna os dados combinados
            res.json(ranking);
        });
    });
});

// Rota para atualizar vitórias e derrotas no Jokenpo
app.post('/update-jokenpo-resultados', (req, res) => {
    const { username, resultado } = req.body;
    const vitoriasPath = path.join(__dirname, 'data', 'jokenpo_vitorias.json'); // Caminho para o JSON de vitórias

    // Lê o arquivo de vitórias
    fs.readFile(vitoriasPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler os dados de vitórias.' });
        }

        // Parse dos dados do arquivo JSON
        let jogadores = JSON.parse(data).jogadores;
        const jogador = jogadores.find(j => j.username === username);

        if (jogador) {
            // Atualiza vitórias ou derrotas com base no resultado
            if (resultado === 'ganhou') {
                jogador.vitorias += 1;
            } else if (resultado === 'perdeu') {
                jogador.derrotas += 1;
            }

            // Escreve o arquivo atualizado de volta ao JSON
            fs.writeFile(vitoriasPath, JSON.stringify({ jogadores }, null, 2), (err) => {
                if (err) {
                    return res.status(500).json({ message: 'Erro ao salvar os resultados.' });
                }
                res.status(200).json({ message: 'Resultados atualizados com sucesso.' });
            });
        } else {
            res.status(404).json({ message: 'Jogador não encontrado.' });
        }
    });
});


// Rota para retornar as conquistas desbloqueadas de cada jogador
app.get('/get-conquistas/:username', (req, res) => {
    const username = req.params.username; // Pega o username do jogador
    const playersPath = path.join(__dirname, 'data', 'players.json'); // Caminho do JSON de jogadores
    const conquistaPath = path.join(__dirname, 'data', 'conquistas.json'); // Caminho do JSON de conquistas

    // Lê o arquivo de jogadores para pegar as conquistas desbloqueadas do jogador
    fs.readFile(playersPath, 'utf8', (err, playersData) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler o arquivo de jogadores.' });
        }

        // Parse dos dados de jogadores
        const jogadores = JSON.parse(playersData).jogadores;
        const jogador = jogadores.find(j => j.username === username);

        if (!jogador || !jogador.conquistasDesbloqueadas) {
            return res.status(404).json({ message: 'Jogador não encontrado ou sem conquistas desbloqueadas.' });
        }

        // Lê o arquivo de conquistas para filtrar as conquistas desbloqueadas pelo jogador
        fs.readFile(conquistaPath, 'utf8', (err, conquistasData) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao ler o arquivo de conquistas.' });
            }

            // Parse dos dados de conquistas
            const conquistas = JSON.parse(conquistasData).conquistas;

            // Filtra as conquistas desbloqueadas do jogador
            const conquistasDesbloqueadas = jogador.conquistasDesbloqueadas.map(idConquista => {
                return conquistas.find(conquista => conquista.id === idConquista);
            }).filter(conquista => conquista !== undefined);

            res.json({ conquistas: conquistasDesbloqueadas });
        });
    });
});

// Rota para retornar todas as conquistas com informações sobre quais estão desbloqueadas para o jogador
app.get('/get-todas-conquistas/:username', (req, res) => {
    const username = req.params.username;
    const playersPath = path.join(__dirname, 'data', 'players.json');
    const conquistasPath = path.join(__dirname, 'data', 'conquistas.json');

    fs.readFile(playersPath, 'utf8', (err, playersData) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler o arquivo de jogadores.' });
        }

        const jogadores = JSON.parse(playersData).jogadores;
        const jogador = jogadores.find(j => j.username === username);

        if (!jogador) {
            return res.status(404).json({ message: 'Jogador não encontrado.' });
        }

        fs.readFile(conquistasPath, 'utf8', (err, conquistasData) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao ler o arquivo de conquistas.' });
            }

            const conquistas = JSON.parse(conquistasData).conquistas;

            // Marca as conquistas como desbloqueadas ou não
            const conquistasComEstado = conquistas.map(conquista => ({
                ...conquista,
                desbloqueada: jogador.conquistasDesbloqueadas.includes(conquista.id)
            }));

            res.json({ conquistas: conquistasComEstado });
        });
    });
});


// Rota para retornar as conquistas
app.get('/conquistas', (req, res) => {
    const conquistaPath = path.join(__dirname, 'data', 'conquistas.json'); // Caminho para o arquivo JSON

    fs.readFile(conquistaPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler o arquivo de conquistas.' });
        }

        // Retorna o conteúdo do arquivo JSON
        res.json(JSON.parse(data));
    });
});

// Rota para retornar os dados do jogador logado
app.get('/get-jogador/:username', (req, res) => {
    const username = req.params.username;
    const playersPath = path.join(__dirname, 'data', 'players.json');

    fs.readFile(playersPath, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao ler o arquivo de jogadores.' });
        }

        const jogadores = JSON.parse(data).jogadores;
        const jogador = jogadores.find(j => j.username === username);

        if (jogador) {
            res.json(jogador);
        } else {
            res.status(404).json({ message: 'Jogador não encontrado.' });
        }
    });
});
