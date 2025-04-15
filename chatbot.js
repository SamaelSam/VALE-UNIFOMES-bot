const express = require('express');  
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const PORT = process.env.PORT || 4000;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Objetos para controle de fluxo e atendimento
const userContext = {};          // Armazena o estado de cada usuário na conversa
const atendimentos = {};         // true = atendimento automático ativo; false = atendimento humano
const temporizadores = {};       // (opcional) para temporizadores de reativação
const cotacaoCount = {};         // Contabiliza mensagens para o fluxo "modelo padrão"

// Exibição do QR Code no terminal
client.on('qr', (qr) => {
    console.log("📸 Escaneie o QR Code para conectar:");
    qrcode.generate(qr, { small: true });
    console.log("⚠️ Certifique-se de escanear o QR Code rapidamente, pois ele expira em alguns segundos!");
});

client.on('message_create', async msg => {
    const remetente = msg.to;
    console.log(`📩 Mensagem recebida no message_create de ${remetente}: ${msg.body}`);

    // Comando para desativar o bot e ativar atendimento humano
    if (msg.body.toLowerCase() === 'iniciar atendimento') {
        atendimentos[remetente] = false; // Atendimento humano ativo
        console.log(`🛑 Atendimento humano iniciado para ${remetente}`);
        await msg.reply('🛑 Atendimento humano iniciado.');
        if (temporizadores[remetente]) {
            clearTimeout(temporizadores[remetente]);
        }
        return;
    }
    // Comando para reativar o atendimento automático
    if (msg.body.toLowerCase() === 'encerrar atendimento') {
        atendimentos[remetente] = true;
        console.log(`✅ Atendimento automatizado reativado para ${remetente}`);
        await msg.reply('✅ Bot ativado novamente!');
        return;
    }
});
client.on('message', async msg => {
    const remetente = msg.from;
    const body = msg.body.trim();

    // Permite voltar ao menu se digitar "menu" ou "0"
    if (body.toLowerCase() === 'menu' || body === '0') {
        userContext[remetente] = 'welcome';
        await sendWelcomeMessage(remetente);
        return;
    }

    // Se o atendimento humano estiver ativo para o contato, o bot não responde
    if (atendimentos[remetente] === false) return;

    // Se ainda não há contexto definido, inicia com a mensagem de boas-vindas
    if (!userContext[remetente]) {
        await sendWelcomeMessage(remetente);
        return;
    }

    // --- Fluxo de Boas-Vindas (menu principal) ---
    if (userContext[remetente] === 'welcome') {
        switch (body) {
            case '1':
                userContext[remetente] = 'cotacao_inicial';
                await client.sendMessage(
                    remetente,
                    "👋 Que bom que você escolheu a VALE Uniformes! Nossa missão é entregar a exclusividade que a sua empresa merece!\n\n🔹 Você já possui um fardamento padrão ou busca novos modelos?\n(0) Para voltar ao menu principal.\n(1) Possuo um modelo padrão.\n(2) Busco novos modelos."
                );
                return;
            case '2':
                userContext[remetente] = 'nova_cotacao_cliente';
                await client.sendMessage(
                    remetente,
                    "🙌 Seja bem-vindo(a) de volta!\n🔹 O seu pedido vai ser no mesmo padrão do último?\n(0) Para voltar ao menu principal.\n(A) Sim\n(B) Não"
                );
                return;
            case '3':
                userContext[remetente] = 'consulta_pedido_inicial';
                await client.sendMessage(
                    remetente,
                    "📦 O que deseja saber sobre seu pedido?\n(0) Para voltar ao menu principal.\n(1) Qual o prazo de entrega do meu pedido?\n(2) Quero alterar algo no meu pedido.\n(3) Outros"
                );
                return;
            case '4':
                userContext[remetente] = 'financeiro_inicial';
                await client.sendMessage(
                    remetente,
                    "💼 Você precisa de ajuda com:\n(0) Para voltar ao menu principal.\n(A) Faturamento/Nota Fiscal\n(B) Pagamento/Recebimento\n(C) Outras questões administrativas"
                );
                return;
            default:
                await client.sendMessage(
                    remetente,
                    "❌ Opção inválida. Por favor, escolha de 1 a 4 ou digite \"menu\" ou \"0\" para reiniciar."
                );
                return;
        }
    }
    // --- Fluxo 1: Solicitar uma cotação ---
    if (userContext[remetente] === 'cotacao_inicial') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        if (body === '1') {
            // Ao selecionar (1) Possuo um modelo padrão, inicializa o contador de mensagens
            userContext[remetente] = 'cotacao_modelo_padrao';
            cotacaoCount[remetente] = 0;
            await client.sendMessage(
                remetente,
                "🔹 Envio de fotos:\nPerfeito! Por favor, envie-nos as fotos do seu modelo e a quantidade de cada item para que possamos dar continuidade ao seu pedido.\n(0) Para voltar ao menu principal."
            );
            return;
        }
        if (body === '2') {
            // Ao escolher (2) Busco novos modelos, direciona para a escolha de categoria
            userContext[remetente] = 'cotacao_novos_modelos';
            await client.sendMessage(
                remetente,
                "🔹 Escolha de categoria:\nEntendido! Nossa equipe vai lhe ajudar a escolher os melhores modelos de fardamento.\nPara isso, escolha o seu segmento:\n(0) Para voltar ao menu principal.\n(1) Operacional\n(2) Social\n(3) Hospitalar\n(4) Gastronomia\n(5) Malharia\n(6) Doméstico"
            );
            return;
        }
        await client.sendMessage(
            remetente,
            "Opção inválida. Responda com (1) ou (2), ou digite \"menu\" ou \"0\" para reiniciar."
        );
        return;
    }

    // Fluxo 1 - Modelo padrão (envio de fotos) com contagem de mensagens
    if (userContext[remetente] === 'cotacao_modelo_padrao') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        if (body.toLowerCase() === 'enviado') {
            if (cotacaoCount[remetente] < 2) {
                // Se ainda não enviou pelo menos duas mensagens, solicita o envio completo
                await client.sendMessage(
                    remetente,
                    "Por favor, envie as fotos e as informações necessárias ou, após enviar, digite \"enviado\"."
                );
                return;
            } else {
                // Se já enviou pelo menos duas mensagens, confirma o atendimento
                await client.sendMessage(
                    remetente,
                    "🔹 Confirmação de atendimento:\nObrigado! Assim que recebermos as fotos, nossa equipe vai analisar e entrar em contato com você o mais breve possível. Aguarde um pouco a análise do seu envio. 😊"
                );
                userContext[remetente] = 'welcome';
                cotacaoCount[remetente] = 0; // Reinicia o contador
                return;
            }
        } else {
            // Cada mensagem que não é "enviado" (supostamente uma foto ou info) incrementa o contador.
            cotacaoCount[remetente] += 1;
            // Quando atingir 2 mensagens, envia um lembrete para confirmar com "enviado".
            if (cotacaoCount[remetente] === 2) {
                await client.sendMessage(
                    remetente,
                    "Por favor, verifique se enviou tanto as fotos quanto as informações necessárias. Quando estiver pronto, digite \"enviado\"."
                );
            }
            return;
        }
    }
    // Fluxo 1 - Novos modelos (escolha de segmento com link)
    if (userContext[remetente] === 'cotacao_novos_modelos') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        if (body === '1') {
            await client.sendMessage(remetente, "Acesse: https://valeuniformes.com.br/operacional/");
        } else if (body === '2') {
            await client.sendMessage(remetente, "Acesse: https://valeuniformes.com.br/social-feminino-masculino/");
        } else if (body === '3') {
            await client.sendMessage(remetente, "Acesse: https://valeuniformes.com.br/hospitalar/");
        } else if (body === '4') {
            await client.sendMessage(remetente, "Acesse: https://valeuniformes.com.br/gastronomia/");
        } else if (body === '5') {
            await client.sendMessage(remetente, "Acesse: https://valeuniformes.com.br/malhas/");
        } else if (body === '6') {
            await client.sendMessage(remetente, "Acesse: https://valeuniformes.com.br/conjunto-helanca/");
        } else {
            await client.sendMessage(remetente, "Opção inválida. Por favor, digite um número entre 0 e 6.");
            return;
        }
        userContext[remetente] = 'welcome';
        return;
    }

    // --- Fluxo 2: Nova cotação para cliente antigo ---
    if (userContext[remetente] === 'nova_cotacao_cliente') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        // Para opção (A), alteramos o estado para aguardar os itens do cliente
        if (body.toUpperCase() === 'A') {
            userContext[remetente] = 'nova_cotacao_cliente_A';
            await client.sendMessage(
                remetente,
                "✅ Certo! Informe os itens e quantidades que deseja que já iremos lhe atender!\n(0) Para voltar ao menu principal."
            );
            return;
        }
        if (body.toUpperCase() === 'B') {
            await client.sendMessage(
                remetente,
                "✏️ Ok! Um dos nossos atendentes já irá lhe atender."
            );
            userContext[remetente] = 'welcome';
            return;
        }
        await client.sendMessage(
            remetente,
            "Opção inválida. Responda com (A) ou (B), ou digite \"menu\" ou \"0\" para reiniciar."
        );
        return;
    }
    // Fluxo 2 - Após opção (A) para nova cotação: aguarda os itens do cliente
    if (userContext[remetente] === 'nova_cotacao_cliente_A') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        // Considera que o cliente enviou os itens
        await client.sendMessage(
            remetente,
            "✏️ Obrigado por informar os itens e quantidades. Agora, por favor, explique qual era o seu último pedido, para que possamos conferir as informações e atendê-lo da melhor forma."
        );
        userContext[remetente] = 'welcome';
        return;
    }

    // --- Fluxo 3: Consultar meu pedido ---
    if (userContext[remetente] === 'consulta_pedido_inicial') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        if (body === '1') {
            userContext[remetente] = 'consulta_pedido_prazo';
            await client.sendMessage(
                remetente,
                "🔹 Pedido de informações do cliente:\nPara poder verificar o status e o prazo de entrega do seu pedido, por favor, nos envie o número do seu pedido ou o nome da sua empresa.\n(0) Para voltar ao menu principal."
            );
            return;
        } else if (body === '2') {
            userContext[remetente] = 'consulta_pedido_alterar';
            await client.sendMessage(
                remetente,
                "🔹 Pedido de informações do cliente:\nTudo bem! Informe abaixo o que gostaria de alterar em seu pedido para verificarmos a possibilidade!\n(0) Para voltar ao menu principal."
            );
            return;
        } else if (body === '3') {
            userContext[remetente] = 'consulta_pedido_outros';
            await client.sendMessage(
                remetente,
                "🔹 Pedido de informações do cliente:\nTudo bem! Informe abaixo o que gostaria de saber sobre o seu pedido!\n(0) Para voltar ao menu principal."
            );
            return;
        } else {
            await client.sendMessage(
                remetente,
                "Opção inválida. Responda com (1), (2) ou (3), ou digite \"menu\" ou \"0\" para reiniciar."
            );
            return;
        }
    }
    if (userContext[remetente] === 'consulta_pedido_prazo') {
        await client.sendMessage(remetente, "📅 O prazo estimado de entrega do seu pedido é de 30 dias úteis, a contar da data do pagamento da entrada ou envio da grade de tamanhos. Se precisar de mais alguma informação, estamos à disposição! 😊");
        await client.sendMessage(
            remetente,
            "Conseguimos te ajudar?\n1- Sim\n2- Não"
        );
        userContext[remetente] = 'consulta_pedido_feedback';
        return;
    }
    if (userContext[remetente] === 'consulta_pedido_feedback') {
        if (body === '1') {
            await client.sendMessage(
                remetente,
                "Que bom! Ficamos felizes em ajudar. 😊"
            );
        } else if (body === '2') {
            await client.sendMessage(
                remetente,
                "Certo! Aguarde um momento por favor, um dos nossos atendentes já irá te ajudar."
            );
        } else {
            await client.sendMessage(
                remetente,
                "Opção inválida. Por favor, responda com 1 (Sim) ou 2 (Não)."
            );
            return;
        }
        userContext[remetente] = 'welcome';
        return;
    }
    if (userContext[remetente] === 'consulta_pedido_alterar' || userContext[remetente] === 'consulta_pedido_outros') {
        await client.sendMessage(
            remetente,
            "✅ Recebemos sua solicitação. Nossa equipe analisará e retornará em breve."
        );
        userContext[remetente] = 'welcome';
        return;
    }

    // --- Fluxo 4: Financeiro e/ou administrativo ---
    if (userContext[remetente] === 'financeiro_inicial') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        const opcao = body.toUpperCase();
        if (opcao === 'A') {
            userContext[remetente] = 'financeiro_faturamento';
            await client.sendMessage(
                remetente,
                "🔹 Confirmação de solicitação:\nEntendido! Podemos emitir sua nota fiscal, ou você precisa de alguma outra informação relacionada a isso?\n(0) Para voltar ao menu principal.\n(A) Emitir nota fiscal\n(B) Outras questões de faturamento"
            );
            return;
        } else if (opcao === 'B') {
            userContext[remetente] = 'financeiro_pagamento';
            await client.sendMessage(
                remetente,
                "🔹 Informações sobre pagamentos:\nClaro! O que você gostaria de saber sobre o pagamento ou recebimento?\n(0) Para voltar ao menu principal.\n(1) Preciso de uma segunda via de boleto\n(2) Perguntas sobre formas de pagamento\n(3) Outras questões financeiras"
            );
            return;
        } else if (opcao === 'C') {
            await client.sendMessage(
                remetente,
                "🔹 Aguarde o atendimento:\nSua solicitação está sendo encaminhada para nosso setor administrativo. Um momento, por favor!"
            );
            userContext[remetente] = 'welcome';
            return;
        } else {
            await client.sendMessage(
                remetente,
                "Opção inválida. Responda com (A), (B) ou (C), ou digite \"menu\" ou \"0\" para reiniciar."
            );
            return;
        }
    }
    if (userContext[remetente] === 'financeiro_faturamento') {
        const opcao = body.toUpperCase();
        if (opcao === 'A') {
            await client.sendMessage(
                remetente,
                "📤 Sua solicitação de emissão de nota fiscal foi recebida! Nossa equipe irá processar em breve."
            );
            userContext[remetente] = 'welcome';
            return;
        } else if (opcao === 'B') {
            await client.sendMessage(
                remetente,
                "🔎 Certo! Encaminharemos sua solicitação para o setor de faturamento. Aguarde um momento."
            );
            userContext[remetente] = 'welcome';
            return;
        } else {
            await client.sendMessage(
                remetente,
                "Opção inválida. Responda com (A) ou (B), ou digite \"menu\" ou \"0\" para reiniciar."
            );
            return;
        }
    }
    if (userContext[remetente] === 'financeiro_pagamento') {
        const opcao = body.toUpperCase();
        if (opcao === '1') {
            await client.sendMessage(
                remetente,
                "📄 Enviaremos a segunda via do seu boleto em instantes. Por favor, aguarde."
            );
            userContext[remetente] = 'welcome';
            return;
        } else if (opcao === '2') {
            await client.sendMessage(
                remetente,
                "💳 Aceitamos pagamentos via boleto, transferência bancária e PIX. Se precisar de mais detalhes, estamos à disposição!"
            );
            userContext[remetente] = 'welcome';
            return;
        } else if (opcao === '3') {
            await client.sendMessage(
                remetente,
                "🔹 Aguarde o atendimento:\nSua solicitação está sendo encaminhada para nosso setor administrativo. Um momento, por favor!"
            );
            userContext[remetente] = 'welcome';
            return;
        } else {
            await client.sendMessage(
                remetente,
                "Opção inválida. Responda com (1), (2) ou (3), ou digite \"menu\" ou \"0\" para reiniciar."
            );
            return;
        }
    }

    // Se a mensagem não se encaixar em nenhum fluxo definido, reinicia o menu
    await sendWelcomeMessage(remetente);
});
// Função para enviar a mensagem de boas-vindas (menu principal)
const sendWelcomeMessage = async (from) => {
    userContext[from] = 'welcome';
    await client.sendMessage(
        from,
        "👋 Olá! Seja bem-vindo(a) à Vale Uniformes. 😊\nPara que possamos lhe atender da melhor forma possível, por favor, selecione uma das opções abaixo:\n1️⃣ Solicitar uma cotação.\n2️⃣ Já sou cliente, quero fazer uma nova cotação.\n3️⃣ Consultar meu pedido.\n4️⃣ Financeiro e/ou administrativo."
    );
};

client.initialize();

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});