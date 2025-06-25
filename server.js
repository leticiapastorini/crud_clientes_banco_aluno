  const express = require('express');
  const { Pool } = require('pg');
  const path = require('path');
  const app = express();

  const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'aluno',
    password: 'root1',
    port: 5432,
  });

  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json());

  // -------------------- CLIENTES --------------------

  app.get('/clientes', async (req, res) => {
    const result = await pool.query('SELECT id, nome FROM cliente ORDER BY nome');
    res.json(result.rows);
  });

  // -------------------- PRODUTOS --------------------

  // Listar todos os produtos
  app.get('/produtos', async (req, res) => {
    const result = await pool.query('SELECT * FROM produto ORDER BY id');
    res.json(result.rows);
  });

  // Buscar produto específico
  app.get('/produtos/:id', async (req, res) => {
    const id = req.params.id;
    const result = await pool.query('SELECT * FROM produto WHERE id = $1', [id]);
    res.json(result.rows[0]);
  });

  // Criar produto
  app.post('/produtos', async (req, res) => {
    const { id, nome, descricao_breve, preco_sugerido, unidades } = req.body;

    try {
      await pool.query(
        'INSERT INTO produto (id, nome, descricao_breve, preco_sugerido, unidades) VALUES ($1, $2, $3, $4, $5)',
        [id, nome, descricao_breve, preco_sugerido, unidades]
      );
      res.status(201).json({ message: '✅ Produto cadastrado com sucesso!' });
    } catch (error) {
      if (error.code === '23505') {
        res.status(400).json({ error: '❌ Já existe um produto com esse ID ou Nome.' });
      } else {
        console.error('Erro ao criar produto:', error);
        res.status(500).send('Erro ao salvar produto');
      }
    }
  });

  // Atualizar produto
  app.put('/produtos/:id', async (req, res) => {
    const id = req.params.id;
    const { nome, descricao_breve, preco_sugerido, unidades } = req.body;

    try {
      await pool.query(
        'UPDATE produto SET nome = $1, descricao_breve = $2, preco_sugerido = $3, unidades = $4 WHERE id = $5',
        [nome, descricao_breve, preco_sugerido, unidades, id]
      );
      res.status(200).json({ message: '✅ Produto editado com sucesso!' });
    } catch (error) {
      console.error('Erro ao editar produto:', error);
      res.status(500).send('Erro ao editar produto');
    }
  });

  // Excluir produto
  app.delete('/produtos/:id', async (req, res) => {
    const id = req.params.id;

    try {
      await pool.query('DELETE FROM produto WHERE id = $1', [id]);
      res.status(200).json({ message: '🗑️ Produto excluído com sucesso!' });
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
      res.status(500).send('Erro ao excluir produto');
    }
  });

  // Detalhes do produto
  app.get('/produtos/:id/detalhes', async (req, res) => {
    const produtoId = req.params.id;

    const produtoQuery = await pool.query(`
      SELECT p.nome AS produto, p.descricao_breve, t.text AS texto_longo
      FROM produto p
      LEFT JOIN textolongo t ON p.textolongo_id = t.id
      WHERE p.id = $1
    `, [produtoId]);

    const clientesQuery = await pool.query(`
      SELECT DISTINCT c.nome AS cliente, r.nome AS regiao
      FROM cliente c
      JOIN ord o ON c.id = o.cliente_id
      JOIN item i ON o.id = i.ord_id
      LEFT JOIN regiao r ON c.regiao_id = r.id
      WHERE i.produto_id = $1
    `, [produtoId]);

    res.json({
      produto: produtoQuery.rows[0],
      clientes: clientesQuery.rows
    });
  });

  // -------------------- PEDIDOS --------------------

  // Criar pedido
  app.post('/pedidos', async (req, res) => {
    const { cliente_id, produtos } = req.body;

    try {
      const pedidoResult = await pool.query(
        `INSERT INTO ord (cliente_id, data_ordenamento, data_expedicao, vendedor_id, total, tipo_pagamento, ordem_cheia)
        VALUES ($1, CURRENT_DATE, CURRENT_DATE, 1, 0, 'CASH', 'Y') RETURNING id`,
        [cliente_id]
      );

      const pedidoId = pedidoResult.rows[0].id;

      let itemId = 1;
      for (let produto of produtos) {
        const produtoResult = await pool.query('SELECT preco_sugerido FROM produto WHERE id = $1', [produto.id]);
        const preco = produtoResult.rows[0].preco_sugerido || 0;

        await pool.query(
          `INSERT INTO item (ord_id, item_id, produto_id, preco, quantidade, quantidade_expedida)
          VALUES ($1, $2, $3, $4, $5, $5)`,
          [pedidoId, itemId, produto.id, preco, produto.quantidade]
        );
        itemId++;
      }

      res.status(201).json({ message: '✅ Pedido criado com sucesso!' });
    } catch (error) {
      console.error('Erro ao criar pedido:', error);
      res.status(500).send('Erro ao salvar pedido');
    }
  });

  // Listar pedidos
  app.get('/pedidos', async (req, res) => {
    try {
      const pedidosQuery = await pool.query(`
        SELECT o.id AS pedido_id, c.nome AS cliente
        FROM ord o
        JOIN cliente c ON c.id = o.cliente_id
        ORDER BY o.id
      `);

      const pedidos = [];

      for (let pedido of pedidosQuery.rows) {
        const itensQuery = await pool.query(`
          SELECT p.nome AS produto, i.preco, i.quantidade
          FROM item i
          JOIN produto p ON p.id = i.produto_id
          WHERE i.ord_id = $1
        `, [pedido.pedido_id]);

        pedidos.push({
          id: pedido.pedido_id,
          cliente: pedido.cliente,
          itens: itensQuery.rows
        });
      }

      res.json(pedidos);
    } catch (error) {
      console.error('Erro ao listar pedidos:', error);
      res.status(500).send('Erro ao buscar pedidos');
    }
  });

  app.post('/login', async (req, res) => {
  const { usuario, senha } = req.body;

  try {
    const result = await pool.query(
      `SELECT * FROM emp 
       WHERE (LOWER(userid) = LOWER($1) OR 
              LOWER(primeiro_nome || '.' || ultimo_nome) = LOWER($1) OR
              CAST(id AS TEXT) = $1)
       AND senha = $2`,
      [usuario, senha]
    );

    if (result.rows.length > 0) {
      res.json({ 
        success: true, 
        message: 'Login realizado com sucesso!', 
        nome: result.rows[0].primeiro_nome 
      });
    } else {
      res.status(401).json({ success: false, error: 'Usuário ou senha inválidos.' });
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro no servidor.' });
  }
});


  app.post('/cadastro', async (req, res) => {
    const { primeiro_nome, ultimo_nome, userid, senha, funcao, salario, dept_id } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO emp (primeiro_nome, ultimo_nome, userid, senha, funcao, salario, dept_id) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [primeiro_nome, ultimo_nome, userid, senha, funcao, salario, dept_id]
      );

      res.json({ success: true, message: '✅ Cadastro realizado com sucesso!', emp: result.rows[0] });
    } catch (error) {
      console.error('Erro no cadastro:', error);
      res.status(500).json({ success: false, error: '❌ Erro ao cadastrar' });
    }
  });
app.get('/departamentos', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nome FROM dept ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar departamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar departamentos' });
  }
});
app.get('/funcoes', async (req, res) => {
  try {
    const result = await pool.query('SELECT funcao FROM funcao ORDER BY funcao');
    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar funções:', error);
    res.status(500).json({ error: 'Erro ao buscar funções' });
  }
});

  // -------------------- INICIAR --------------------

  app.listen(3000, () => {
    console.log('🚀 Servidor rodando na porta 3000');
  });
