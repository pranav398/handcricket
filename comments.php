<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Home - HandCricket</title>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600&display=swap" rel="stylesheet">

  <!-- Extra styles (ONLY additions, no changes to your CSS) -->
  <style>
    .loader {
      margin: 40px auto;
      width: 60px;
      height: 60px;
      border: 2px solid rgba(176,184,196,0.2);
      border-top: 2px solid var(--silver);
      border-radius: 50%;
      animation: spin 1.2s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .status {
      margin-bottom: 20px;
      font-size: 0.8rem;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: var(--slate-warm);
      opacity: 0.6;
    }
  </style>
</head>
<body>
    <?php include 'assets/includes/header.php'; ?>

<div class="atmosphere"></div>

<div class="main">
  <section class="hero">

    <div class="hero-badge">
      <div class="hero-badge-dot"></div>
      <span>Work In Progress</span>
    </div>

    <h1>Building <em>Something Great</em></h1>

    <p class="hero-sub">
      This page is currently under development.  
      We're crafting a smooth and powerful experience for you.
    </p>

    <div class="loader"></div>

    <div class="hero-ctas">
      <a href="/" class="btn-primary">Back to Home</a>
    </div>

  </section>
</div>
</body>
</html>
