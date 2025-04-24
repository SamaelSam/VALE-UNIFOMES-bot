const express = require('express');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const PORT = process.env.PORT || 3002;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Tempo de inatividade no atendimento humano
const inactivityTimeouts = {};
function setInactivityTimeout(userId) {
    if (inactivityTimeouts[userId]) clearTimeout(inactivityTimeouts[userId]);
    inactivityTimeouts[userId] = setTimeout(() => {
        // Retorna ao modo automático silenciosamente
        if (atendimentos[userId] === false) {
            atendimentos[userId] = true;  // Volta ao automático sem notificação
        }
    }, 10 * 60 * 60 * 1000); // 10 horas
}

// Objetos para controle de fluxo e atendimento
const userContext = {};          
const atendimentos = {};         
const temporizadores = {};       
const cotacaoCount = {};         
// QR Code
const services = [
    "1. Criação de Websites",
    "2. E-mails Personalizados",
    "3. Campanhas Sociais",
    "4. WhatsApp"
];

client.on('qr', (qr) => {
    console.log('\n🔗 Link para autenticação:');
    // Link direto e clicável para gerar o QR Code
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}\n`);
    console.log('⚠️ Acesse o link acima ou escaneie pelo WhatsApp Web');
});

client.on('ready', () => {
    console.log('✅ Tudo certo! WhatsApp conectado');
});

client.on('auth_failure', (message) => {
    console.error('❌ Falha na autenticação:', message);
});

// Ativar/desativar atendimento humano
client.on('message_create', async msg => {
    const remetente = msg.to;
    if (msg.body.toLowerCase() === 'iniciar atendimento') {
        atendimentos[remetente] = false; 
        clearTimeout(inactivityTimeouts[remetente]);
        await msg.reply('🛑 Atendimento humano iniciado.');
        return;
    }
    if (msg.body.toLowerCase() === 'encerrar atendimento') {
        atendimentos[remetente] = true;
        await msg.reply('✅ Bot ativado novamente!');
        return;
    }
});
client.on('message', async msg => {
    const remetente = msg.from;
    const body = msg.body.trim();
    const isGroupMsg = remetente.endsWith('@g.us');

    // 🛑 Ignora mensagens de grupo
    if (isGroupMsg) {
        console.log(`Mensagem de grupo ignorada: ${remetente}`);
        return;
    }

    // Permite voltar ao menu
    if (body.toLowerCase() === 'menu' || body === '0') {
        userContext[remetente] = 'welcome';
        await sendWelcomeMessage(remetente);
        return;
    }

    // Se atendimento humano ativo, só dispara timeout e não responde
    if (atendimentos[remetente] === false) {
        setInactivityTimeout(remetente);
        return;
    }

    // Primeiro acesso: envia boas‑vindas automáticas
    if (!userContext[remetente]) {
        await sendWelcomeMessage(remetente);
        return;
    }

    const contexto = userContext[remetente];
    // --- Fluxo de Boas‑Vindas (menu principal) ---
    if (contexto === 'welcome') {
        switch (body) {
            case '1':
                userContext[remetente] = 'cotacao_inicial';
                await client.sendMessage(
                    remetente,
                    "👋 Que bom que você escolheu a VALE Uniformes! Nossa missão é entregar a exclusividade que a sua empresa merece!\n\n🔹 Você já possui um fardamento padrão ou busca novos modelos?\n0️⃣ Para voltar ao menu principal.\n1️⃣ Possuo um modelo padrão.\n2️⃣ Busco novos modelos."
                );
                return;
            case '2':
                userContext[remetente] = 'nova_cotacao_cliente';
                await client.sendMessage(
                    remetente,
                    "🙌 Seja bem‑vindo(a) de volta!\n🔹 O seu pedido vai ser no mesmo padrão do último?\n0️⃣ Para voltar ao menu principal.\n(A) Sim\n(B) Não"
                );
                return;
            case '3':
                userContext[remetente] = 'consulta_pedido_inicial';
                await client.sendMessage(
                    remetente,
                    "📦 O que deseja saber sobre seu pedido?\n0️⃣ Para voltar ao menu principal.\n1️⃣ Qual o prazo de entrega do meu pedido?\n2️⃣ Quero alterar algo no meu pedido.\n3️⃣ Outros"
                );
                return;
            case '4':
                userContext[remetente] = 'financeiro_inicial';
                await client.sendMessage(
                    remetente,
                    "💼 Você precisa de ajuda com:\n0️⃣ Para voltar ao menu principal.\n(A) Financeiro\n(B) Pagamento/Recebimento\n(C) Outras questões administrativas"
                );
                return;
            default:
               
                return;
        }
    }

    // --- Fluxo 1: Solicitar uma cotação ---
    if (contexto === 'cotacao_inicial') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        if (body === '1') {
            userContext[remetente] = 'cotacao_modelo_padrao';
            cotacaoCount[remetente] = 0;
            await client.sendMessage(
                remetente,
                "🔹 Envio de fotos:\nPerfeito! Por favor, envie-nos as fotos do seu modelo e a quantidade de cada item para que possamos dar continuidade ao seu pedido.\n0️⃣ Para voltar ao menu principal."
            );
            return;
        }
        if (body === '2') {
            userContext[remetente] = 'cotacao_novos_modelos';
            await client.sendMessage(
                remetente,
                "🔹 Escolha de categoria:\nEntendido! Nossa equipe vai lhe ajudar a escolher os melhores modelos de fardamento.\nPara isso, escolha o seu segmento:\n0️⃣ Para voltar ao menu principal.\n1️⃣ Operacional\n2️⃣ Social\n3️⃣ Hospitalar\n4️⃣ Gastronomia\n5️⃣ Malharia\n6️⃣ Doméstico"
            );
            return;
        }
        await client.sendMessage(
            remetente,
            "Opção inválida. Responda com (1) ou (2), ou digite \"menu\" ou \"0\" para reiniciar."
        );
        return;
    }
    // Fluxo 1 - Modelo padrão (envio de fotos)
    if (contexto === 'cotacao_modelo_padrao') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        if (body.toLowerCase() === 'enviado') {
            if (cotacaoCount[remetente] < 2) {
                await client.sendMessage(
                    remetente,
                    "Por favor, envie as fotos e as informações necessárias ou, após enviar, digite \"*enviado*\"."
                );
                return;
            } else {
                await client.sendMessage(
                    remetente,
                    "🔹 Confirmação de atendimento:\nObrigado! Assim que recebermos as fotos, nossa equipe vai analisar e entrar em contato com você o mais breve possível. Aguarde um pouco a análise do seu envio. 😊 \n0️⃣ Caso precise retornar ao menu."
                );
                userContext[remetente] = 'welcome';
                cotacaoCount[remetente] = 0;
                return;
            }
        } else {
            cotacaoCount[remetente]++;
            if (cotacaoCount[remetente] === 2) {
                await client.sendMessage(
                    remetente,
                    "Por favor, verifique se enviou tanto as fotos quanto as informações necessárias. Quando estiver pronto, digite \"*enviado*\"."
                );
            }
            return;
        }
    }

    // Fluxo 1 - Novos modelos
    if (contexto === 'cotacao_novos_modelos') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        const links = {
            '1': 'https://valeuniformes.com.br/operacional/',
            '2': 'https://valeuniformes.com.br/social-feminino-masculino/',
            '3': 'https://valeuniformes.com.br/hospitalar/',
            '4': 'https://valeuniformes.com.br/gastronomia/',
            '5': 'https://valeuniformes.com.br/malhas/',
            '6': 'https://valeuniformes.com.br/conjunto-helanca/'
        };
        if (links[body]) {
            await client.sendMessage(remetente, `Acesse: ${links[body]}`);
            userContext[remetente] = 'welcome';
        } else {
            await client.sendMessage(remetente, "Opção inválida. Por favor, digite um número entre 0 e 6.");
        }
        return;
    }

    // --- Fluxo 2: Nova cotação para cliente antigo ---
    if (contexto === 'nova_cotacao_cliente') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        if (body.toUpperCase() === 'A') {
            userContext[remetente] = 'nova_cotacao_cliente_A';
            await client.sendMessage(
                remetente,
                "✅ Certo! Informe os itens e quantidades que deseja que já iremos lhe atender!\n0️⃣ Para voltar ao menu principal."
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
    // --- Fluxo 3: Consultar meu pedido ---
    if (contexto === 'consulta_pedido_inicial') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        if (body === '1') {
            // Agora enviamos direto o prazo, com *30 dias úteis* em negrito
            await client.sendMessage(
                remetente,
                "📅 O prazo estimado de entrega do seu pedido é de *30 dias úteis*, a contar da data do pagamento da entrada ou envio da grade de tamanhos. Se precisar de mais alguma informação, estamos à disposição! 😊 \n0️⃣ Caso precise retornar ao menu."
            );
            await client.sendMessage(
                remetente,
                "Conseguimos te ajudar?\n1- Sim\n2- Não"
            );
            userContext[remetente] = 'consulta_pedido_feedback';
            return;
        }
        if (body === '2' || body === '3') {
            await client.sendMessage(
                remetente,
                "🔹 Pedido de informações do cliente:\nTudo bem! Informe abaixo o que \ngostaria de saber sobre o seu pedido!\n0️⃣ Para voltar ao menu principal."
            );
            userContext[remetente] = 'aguardando_solicitacao'; // Alterado aqui
            return;
        }
        await client.sendMessage(
            remetente,
            "Opção inválida. Responda com (1), (2) ou (3), ou digite \"menu\" ou \"0\" para reiniciar."
        );
        return;
    }

    // Novo contexto para tratar a resposta após selecionar 2 ou 3
    if (contexto === 'aguardando_solicitacao') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        await client.sendMessage(
            remetente,
            "✅ Recebemos sua solicitação. Nossa \nequipe analisará e retornará em breve."
        );
        userContext[remetente] = 'welcome';
        return;
    }

    if (contexto === 'consulta_pedido_feedback') {
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
    // --- Fluxo 4: Financeiro e/ou administrativo ---
    if (contexto === 'financeiro_inicial') {
        if (body === '0') {
            userContext[remetente] = 'welcome';
            await sendWelcomeMessage(remetente);
            return;
        }
        const opcao = body.toUpperCase();
        if (opcao === 'A') {
            userContext[remetente] = 'aguardando_msg_financeiro';
            await client.sendMessage(
                remetente,
                "Como o nosso setor financeiro pode lhe ajudar?"
            );
            return;
        } else if (opcao === 'B') {
            userContext[remetente] = 'financeiro_pagamento';
            await client.sendMessage(
                remetente,
                "🔹 Informações sobre pagamentos:\nClaro! O que você gostaria de saber sobre o pagamento ou recebimento?\n0️⃣ Para voltar ao menu principal.\n1️⃣ Preciso de uma segunda via de boleto\n2️⃣ Perguntas sobre formas de pagamento\n3️⃣ Outras questões financeiras"
            );
            return;
        } else if (opcao === 'C') {
            await client.sendMessage(
                remetente,
                "🔹 Aguarde o atendimento:\nSua solicitação está sendo encaminhada para nosso setor administrativo. Um momento, por favor!"
            );
            userContext[remetente] = 'welcome';
            return;
        }
        await client.sendMessage(
            remetente,
            "Opção inválida. Responda com (A), (B) ou (C), ou digite \"menu\" ou \"0\" para reiniciar."
        );
        return;
    }

    // Fluxo financeiro – segunda via, formas de pagamento etc.
    if (contexto === 'financeiro_pagamento') {
        const opcao = body.toUpperCase();
        if (opcao === '1') {
            await client.sendMessage(
                remetente,
                "📄 Enviaremos a segunda via do seu boleto em instantes. Por favor, aguarde."
            );
        } else if (opcao === '2') {
            await client.sendMessage(
                remetente,
                "💳 Aceitamos pagamentos via boleto, transferência bancária e PIX. Se precisar de mais detalhes, estamos à disposição!"
            );
        } else if (opcao === '3') {
            await client.sendMessage(
                remetente,
                "🔹 Aguarde o atendimento:\nSua solicitação está sendo encaminhada para nosso setor administrativo. Um momento, por favor!"
            );
        } else {
            await client.sendMessage(
                remetente,
                "Opção inválida. Responda com (1), (2) ou (3), ou digite \"menu\" ou \"0\" para reiniciar."
            );
            return;
        }
        userContext[remetente] = 'welcome';
        return;
    }
    if (contexto === 'aguardando_msg_financeiro') {
        await client.sendMessage(
            remetente,
            "✅ Recebido! Estamos verificando e já iremos responder!"
        );
        userContext[remetente] = 'welcome';
        return;
    }

    // Qualquer outro caso, volta ao menu
    await sendWelcomeMessage(remetente);
});

// Função de boas‑vindas (menu principal)
const sendWelcomeMessage = async (from) => {
    userContext[from] = 'welcome';
    await client.sendMessage(
        from,
        "👋 Olá! Seja bem-vindo(a) à Vale Uniformes. \nPara um melhor atendimento, por gentileza, selecione uma das opções abaixo😊:\n1️⃣ Solicitar uma cotação.\n2️⃣ Já sou cliente, quero fazer uma nova cotação.\n3️⃣ Consultar meu pedido.\n4️⃣ Financeiro e/ou administrativo."
    );
};

client.initialize();

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
