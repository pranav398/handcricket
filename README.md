# 🏏 HandCricket

> A fun online hand cricket game built with PHP, JavaScript, and Firebase.

## 🌐 Live Demo

The game is currently live at:

**https://handcricket.gamer.gd**

You can play the current deployed version directly in your browser.

## 🌐 About

**HandCricket** is a browser-based implementation of the classic hand cricket game.

The project supports both single-player and multiplayer gameplay, allowing players to play against the computer or create/join online matches with other players.

The application includes authentication, match creation and joining, game dashboards, multiplayer APIs, and a Firebase-backed multiplayer system.

## ✨ Features

- 🏏 Online hand cricket gameplay
- 🤖 Player vs Computer mode
- 👥 Multiplayer matches
- ⚔️ Player vs Player matches
- 👥👥 2v2 multiplayer matches
- 🔐 User registration and login
- 🎮 Match creation and joining
- 📊 Game dashboard
- 💬 Match comments
- 📜 Game rules page
- 🚪 Match exit/leave functionality
- 🔥 Firebase-powered multiplayer functionality
- 📱 Browser-based interface

## 🎮 Game Modes

### 🤖 Computer Match

Play a hand cricket match against the computer.

The game includes a setup flow before starting the match and then handles the innings and scoring during gameplay.

### 👤 Multiplayer Match

Create a match and allow another player to join.

The project provides separate pages for creating and joining multiplayer matches.

### 👥👥 2v2 Match

The application also includes support for **2v2 multiplayer matches**.

Players can create and join 2v2 matches through the dedicated multiplayer pages.

## 🔐 Authentication

The application provides a basic account system with:

- Registration
- Login
- Logout
- Session-based access

Relevant files include:

```text
register.php
login.php
logout.php
```


## 🎮 Game Flow

The game follows a simple hand-cricket flow designed to make both single-player and multiplayer matches easy to start.

### 1. Create an Account

Players can register for an account and log in before accessing the game dashboard.

### 2. Choose a Game Mode

From the dashboard, players can choose between different modes:

- **Computer Match** — play against the computer.
- **Multiplayer Match** — create or join a match with another player.
- **2v2 Match** — create or join a team-based multiplayer match.

### 3. Set Up the Match

For multiplayer games, one player creates a match and receives the information needed for other players to join.

Players can then join the appropriate match before the game begins.

### 4. Play the Innings

Once the match starts, players make their hand-cricket choices during each ball.

The game keeps track of the current innings and score and determines when a player is out according to the game's rules.

### 5. Chase the Target

After the first innings, the required target is established and the other side gets its turn to bat.

The second innings continues until the target is reached or the innings ends.

### 6. Match Result

At the end of the match, the game determines the winner based on the final scores.

Multiplayer matches use the application's backend/Firebase functionality to keep the game state synchronized between players.

### 🏏 In Short

```text
Register / Login
       ↓
Choose Game Mode
       ↓
Create or Join Match
       ↓
Match Setup
       ↓
First Innings
       ↓
Target Set
       ↓
Second Innings
       ↓
Final Score
       ↓
Match Result
```

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| PHP | Server-side logic and game flow |
| JavaScript | Client-side functionality |
| HTML | Page structure |
| CSS | Interface styling |
| Firebase | Multiplayer/backend data functionality |
| MySQL/PHP database components | Local application data where applicable |
| Apache | Web server |

## 📂 Project Structure

```text
handcricket/
│
├── assets/
│   └── CSS, JavaScript and Firebase configuration
│
├── .htaccess
│
├── index.php
├── login.php
├── register.php
├── logout.php
│
├── dashboard.php
│
├── rules.php
│
├── cpu_match.php
├── setup_cpu.php
│
├── create_match.php
├── join_match.php
├── game.php
├── exit_match.php
│
├── create_2v2_match.php
├── join_2v2_match.php
├── mp_2v2_match.php
│
├── mp_match.php
├── mp_api.php
├── exit_mp_match.php
│
├── comments.php
│
└── database.rules.json
```

## 🚀 Installation

### Requirements

- PHP 8.x or later
- Apache
- MySQL/MariaDB if required by the local configuration
- A modern web browser
- Firebase project/configuration for multiplayer functionality
- XAMPP is recommended for local development

### 1. Clone the repository

```bash
git clone https://github.com/pranav398/handcricket.git
cd handcricket
```

### 2. Place the project in XAMPP

Copy the project into the XAMPP `htdocs` directory:

```text
C:\xampp\htdocs\handcricket
```

### 3. Start Apache

Open XAMPP and start **Apache**.

Start **MySQL** as well if your local configuration uses a MySQL database.

### 4. Configure Firebase

The multiplayer functionality uses Firebase.

Before deploying the multiplayer functionality, configure the Firebase settings required by the application.

Do **not** commit private credentials, service-account files, passwords, or other secrets to the repository.

Firebase web configuration values should be protected through appropriate Firebase Authentication and Database Security Rules rather than treating client-side configuration as a password.

### 5. Open the application

Visit:

```text
http://localhost/handcricket/
```

## 🔥 Firebase

Firebase is used for the application's multiplayer functionality.

The repository includes:

```text
database.rules.json
```

These rules determine what clients are allowed to read and write in the Firebase database.

Before deploying the application publicly, review the Firebase security rules carefully and ensure that users cannot access or modify data they should not be able to access.

## 🗃️ Database

If the application version you are running requires a MySQL database, configure the database connection for your local XAMPP environment.

Typical local XAMPP configuration:

```text
Host: localhost
Username: root
Password:
```

Never use these default credentials for a production deployment.

## 🎯 How to Play

1. Open the website.
2. Register for an account or log in.
3. Open the dashboard.
4. Choose a game mode.
5. Create or join a match where applicable.
6. Follow the in-game instructions.
7. Play your innings and score runs.
8. Complete the match and view the result.

For detailed rules, use the application's:

```text
rules.php
```

page.

## 🔒 Security Notes

If you deploy this project publicly:

- Never commit passwords or private API credentials.
- Do not commit Firebase service-account JSON files.
- Review `database.rules.json` before deployment.
- Use HTTPS.
- Validate user input server-side.
- Protect authenticated endpoints.
- Use secure session settings.
- Restrict database permissions.
- Keep PHP and server software updated.

### Firebase Configuration

Firebase browser configuration is not equivalent to a private server credential. Security should be enforced using Firebase Authentication and appropriate database rules.

If a real secret or credential has ever been committed to Git history, rotate/revoke it even after removing it from the current files.

## 🧭 Main Pages

| File | Purpose |
|---|---|
| `index.php` | Main landing page |
| `register.php` | User registration |
| `login.php` | User login |
| `logout.php` | Logout |
| `dashboard.php` | User dashboard |
| `rules.php` | Game rules |
| `setup_cpu.php` | Computer-match setup |
| `cpu_match.php` | Computer match |
| `create_match.php` | Create multiplayer match |
| `join_match.php` | Join multiplayer match |
| `game.php` | Multiplayer game |
| `create_2v2_match.php` | Create 2v2 match |
| `join_2v2_match.php` | Join 2v2 match |
| `mp_2v2_match.php` | 2v2 multiplayer game |
| `mp_api.php` | Multiplayer backend/API |
| `comments.php` | Match comments |

## 📌 Project Status

**Active Development**

The project is a personal web-development project and may continue to receive improvements, bug fixes, UI changes, and new game functionality.

## 🤝 Contributing

Suggestions, bug reports, and improvements are welcome.

To contribute:

1. Fork the repository.
2. Create a new branch.
3. Make your changes.
4. Test the application locally.
5. Submit a pull request.

## ⚠️ Disclaimer

This is an independent student project and is not affiliated with or endorsed by IIT Bombay or any other institution.

## 👨‍💻 Author

**Pranav**

Computer Science & Engineering  
IIT Bombay

GitHub: https://github.com/pranav398

## 🔗 Repository

https://github.com/pranav398/handcricket

---

<p align="center">
  Built with 🏏 by Pranav
</p>
