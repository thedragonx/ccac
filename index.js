const Discord = require("discord.js-selfbot-v13");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");

const config = {
	userToken: "MzEyNjE4MTA3NTkwMTQ4MDk2.GNhbqr.63bfVp4q-dHq3FhTssibMNB-HexbdZUZPqJG8E",
	botToken: "MTIxNDM5NDc1MTg2OTI1NTczMg.G_ajGK.YkQn6wOKl1xKPikRrO0up42qIXA314FrrXByEg",
	channelMapping: {
		// "1215350100700831775": "1215332150404980738", //bot-commands
		// "1153016190004891678": "1214441302477766707", //berita-crypto
		"1258709288994607250": "1335508594585636964", //pojok-avs
		"1153033344804733029": "1335508757056065608", //act-altcoin
		"1186482371596398593": "1335508856004022295", //rahasia-market
		"1156425621661032459": "1335509053224521748", //pengumuman-premium
		"1228962492076785785": "1335508558560624712", //pojok-ncek
		// "1204244802896535633": "1224319055578791976", //pengumuman-contrarian
		"1241256779564711938": "1335508915961466880", //smart-money
		// "1241975930306428998": "1242706760049885194", //sensitive-news
		"1184295348466876437": "1335508704631590933", //act-bitcoin
		// "1154734446147272815": "1335508653494767616", //pojok-profe
		"1250988860624736278": "1335508810504208396", //market-update
		"1319121612750061608": "1335508985956012125", //web3
	},
	logFile: "messages_map.json",
};

class MessageForwarder {
	constructor(config) {
		this.config = config;
		this.userClient = new Discord.Client({
			checkUpdate: false,
			syncStatus: false,
		});
		this.botClient = new Client({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
		});

		try {
			const data = fs.readFileSync(this.config.logFile, "utf8");
			this.messageMap = new Map(JSON.parse(data));
		} catch (error) {
			console.log("No existing message map found, creating new one");
			this.messageMap = new Map();
		}

		this.pollMap = new Map();
		this.startTime = Date.now();

		// Bind methods
		this.handleUserMessage = this.handleUserMessage.bind(this);
		this.handleBotMessage = this.handleBotMessage.bind(this);
		this.handleUserReady = this.handleUserReady.bind(this);
		this.handleBotReady = this.handleBotReady.bind(this);
	}

	saveMessageMap() {
		try {
			const mapArray = Array.from(this.messageMap.entries());
			fs.writeFileSync(this.config.logFile, JSON.stringify(mapArray), "utf8");
		} catch (error) {
			console.error("Error saving message map:", error);
		}
	}

	createInitialPollEmbed(poll, author) {
		if (!poll || !author) {
			console.error("Invalid poll or author data");
			return null;
		}

		try {
			const embed = new EmbedBuilder()
				.setColor(0x2b2d31)
				.setAuthor({
					name: author.globalName || author.username,
					iconURL: author.displayAvatarURL({ dynamic: true }),
				})
				.setTitle(poll.question?.text || "Poll Question")
				.setFooter({ text: "Poll" })
				.setTimestamp();

			if (poll.answers && poll.answers.size > 0) {
				const options = Array.from(poll.answers.values());
				const optionsText = options.map((answer, index) => {
					const letterEmoji = String.fromCodePoint(0x1f1e6 + index);
					return {
						name: `${letterEmoji} Option ${index + 1}`,
						value: `${answer.text || "No text"}\n${"⬜".repeat(10)} 0%\n0 votes`,
						inline: false,
					};
				});

				embed.addFields(optionsText);
			}

			embed.addFields({
				name: "\u200B",
				value: `0 total votes`,
				inline: false,
			});

			return embed;
		} catch (error) {
			console.error("Error creating initial poll embed:", error);
			return null;
		}
	}

	createPollResultEmbed(pollData, author) {
		if (!pollData || !author) {
			console.error("Invalid poll data or author");
			return { embed: null };
		}

		try {
			const percentage = pollData.total_votes > 0 ? Math.round((pollData.victor_answer_votes / pollData.total_votes) * 100) : 0;

			const embed = new EmbedBuilder()
				.setColor(0x2b2d31)
				.setDescription(`${pollData.poll_question_text || "Poll Question"}\n\n${pollData.victor_answer_text || "No winner"}`)
				.addFields([
					{
						name: pollData.victor_answer_text || "No winner",
						value: `Winning answer • ${percentage}%`,
						inline: false,
					},
				])
				.setTimestamp();

			return { embed };
		} catch (error) {
			console.error("Error creating poll result embed:", error);
			return { embed: null };
		}
	}

	async handlePingCommand(channel) {
		try {
			const latency = Math.round(this.botClient.ws.ping);

			const embed = new EmbedBuilder()
				.setColor(0x2b2d31)
				.setTitle("🤖 Bot Status")
				.setDescription("Informasi status bot saat ini:")
				.addFields([
					{
						name: "📊 Latency",
						value: `${latency}ms`,
						inline: true,
					},
					{
						name: "🤖 Nama Bot",
						value: this.botClient.user.username,
						inline: true,
					},
					{
						name: "🟢 Status Koneksi",
						value: "Terhubung",
						inline: true,
					},
				]);

			await channel.send({ embeds: [embed] });
		} catch (error) {
			console.error("Error handling ping command:", error);
			await channel.send("Error getting bot status.");
		}
	}

	async handleUserMessage(message) {
		try {
			if (message.content.toLowerCase() === "!ping") {
				const targetChannelId = this.config.channelMapping[message.channel.id];
				if (targetChannelId) {
					const targetChannel = await this.botClient.channels.fetch(targetChannelId);
					await this.handlePingCommand(targetChannel);
				}
				return;
			}

			if (message.channel.id in this.config.channelMapping) {
				await this.forwardMessage(message);
			}
		} catch (error) {
			console.error("Error in user message handler:", error);
		}
	}

	async handleBotMessage(message) {
		try {
			if (message.content.toLowerCase() === "!ping") {
				await this.handlePingCommand(message.channel);
				return;
			}
		} catch (error) {
			console.error("Error in bot message handler:", error);
		}
	}

	async forwardMessage(message) {
		try {
			const targetChannelId = this.config.channelMapping[message.channel.id];
			const targetChannel = await this.botClient.channels.fetch(targetChannelId);

			// Prepare components
			const senderName = message.author.globalName || message.author.username;
			const timestamp = `<t:${Math.floor(message.createdTimestamp / 1000)}:F>`;
			const header = `**${senderName}** • ${timestamp}`;
			const tag = message.channel.id !== "1214441302477766707" ? "\n<@&1335509302152134676>" : "";
			const fullHeader = `${header}${tag}\n`;

			// Length calculations
			const MAX_DISCORD_LENGTH = 2000;
			const headerLength = fullHeader.length;
			const tagLength = tag.length;
			const maxFirstPart = MAX_DISCORD_LENGTH - headerLength;
			const maxSecondPart = MAX_DISCORD_LENGTH - tagLength;

			let messageContent = (message.content || "").replace(/<@&1152655670915637389>/g, "").trim();

			// Auto-truncate if content exceeds maximum possible length
			const maxTotalLength = maxFirstPart + maxSecondPart;
			if (messageContent.length > maxTotalLength) {
				messageContent = messageContent.substring(0, maxTotalLength);
			}

			const messageParts = [];
			const baseOptions = {
				allowedMentions: { roles: ["1335509302152134676"] },
			};

			// Split message with intelligent paragraph handling
			if (messageContent.length > maxFirstPart) {
				const firstPartEnd = this.findBestSplitIndex(messageContent, maxFirstPart);
				const firstPart = messageContent.slice(0, firstPartEnd).trim();
				const remainingContent = messageContent.slice(firstPartEnd).trim();

				const secondPartEnd = this.findBestSplitIndex(remainingContent, maxSecondPart - tagLength);
				const secondPart = remainingContent.slice(0, secondPartEnd).trim();

				messageParts.push(firstPart);
				if (secondPart) messageParts.push(secondPart);
			} else {
				messageParts.push(messageContent);
			}

			// Send messages with proper formatting
			let sentMessageId;
			for (let i = 0; i < messageParts.length; i++) {
				const currentOptions = { ...baseOptions };
				const isLastPart = i === messageParts.length - 1;

				// Construct message content
				if (i === 0) {
					currentOptions.content = `${fullHeader}${messageParts[i]}`;

					// Handle special content ONLY in first part
					if (message.type === "POLL_RESULT" || message.type === "POLL_END") {
						const pollData = message.poll;
						const resultEmbed = this.createPollResultEmbed(pollData, message.author);
						if (resultEmbed && resultEmbed.embed) {
							currentOptions.embeds = [resultEmbed.embed];
						}
					} else if (message.poll) {
						const pollEmbed = this.createInitialPollEmbed(message.poll, message.author);
						if (pollEmbed) {
							currentOptions.embeds = [pollEmbed];
							this.pollMap.set(message.id, message.poll);
						}
					} else if (message.embeds?.length > 0) {
						try {
							currentOptions.embeds = message.embeds
								.map((embed) => {
									try {
										return new EmbedBuilder(embed.toJSON());
									} catch (embedError) {
										console.error("Error converting embed:", embedError);
										return null;
									}
								})
								.filter((embed) => embed !== null);
						} catch (embedsError) {
							console.error("Error processing embeds:", embedsError);
							currentOptions.embeds = [];
						}
					}
				} else {
					currentOptions.content = `${messageParts[i]}${tag}`;
					currentOptions.embeds = [];
				}

				// Add attachments to last part
				if (isLastPart && message.attachments?.size > 0) {
					currentOptions.files = Array.from(message.attachments.values()).map((a) => ({
						attachment: a.url,
						name: a.name,
					}));
				}

				// Handle message replies
				if (message.reference && i === 0) {
					const repliedMessageId = message.reference.messageId;
					const targetReplyId = this.messageMap.get(repliedMessageId);
					if (targetReplyId) {
						currentOptions.reply = { messageReference: targetReplyId };
					}
				}

				const sentMessage = await targetChannel.send(currentOptions);

				// Store mapping for replies
				if (i === 0) {
					sentMessageId = sentMessage.id;
					this.messageMap.set(message.id, sentMessageId);
				}

				await new Promise((resolve) => setTimeout(resolve, 500));
			}

			// Handle poll reactions
			if (message.poll && message.type !== "POLL_END") {
				const sentMessage = await targetChannel.messages.fetch(sentMessageId);
				const optionsCount = message.poll.answers.size;
				for (let i = 0; i < optionsCount; i++) {
					const letterEmoji = String.fromCodePoint(0x1f1e6 + i);
					await sentMessage.react(letterEmoji);
				}
			}

			this.saveMessageMap();
			console.log(`✅ Message forwarded: ${message.id} → ${sentMessageId}`);
		} catch (error) {
			console.error("🚨 Error forwarding message:", error);
		}
	}

	findBestSplitIndex(content, maxPos) {
		const splitPriorities = [
			{
				pattern: "\n\n",
				adjustment: 2,
			},
			{
				pattern: "\n――――――――――――――――――――――\n",
				adjustment: 25,
			},
			{
				pattern: ". ",
				adjustment: 2,
			},
			{
				pattern: "\n",
				adjustment: 1,
			},
			{
				pattern: " ",
				adjustment: 1,
			},
		];

		for (const { pattern, adjustment } of splitPriorities) {
			const index = content.lastIndexOf(pattern, maxPos);
			if (index > -1) {
				return index + adjustment;
			}
		}

		return Math.min(maxPos, content.length);
	}

	async handleUserReady() {
		console.log("User client ready!");
	}

	async handleBotReady() {
		console.log("Bot client ready!");

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const twoDaysAgo = new Date(today);
		twoDaysAgo.setDate(today.getDate() - 2);

		// Add initial delay to ensure clients are fully ready
		await new Promise((resolve) => setTimeout(resolve, 5000));

		for (const [sourceChannelId, targetChannelId] of Object.entries(this.config.channelMapping)) {
			try {
				console.log(`Processing channel ${sourceChannelId}...`);

				// Add delay between processing each channel
				await new Promise((resolve) => setTimeout(resolve, 2000));

				// Fetch source channel with retry mechanism
				let sourceChannel = null;
				let retryCount = 0;
				const maxRetries = 3;

				while (!sourceChannel && retryCount < maxRetries) {
					try {
						sourceChannel = await this.userClient.channels.fetch(sourceChannelId);
						if (!sourceChannel) {
							throw new Error("Channel is null");
						}
					} catch (error) {
						retryCount++;
						console.log(`Retry ${retryCount} for channel ${sourceChannelId}`);
						await new Promise((resolve) => setTimeout(resolve, 2000 * retryCount));
					}
				}

				if (!sourceChannel) {
					throw new Error(`Failed to fetch channel ${sourceChannelId} after ${maxRetries} attempts`);
				}

				// Fetch messages with error handling
				let messages;
				try {
					messages = await sourceChannel.messages.fetch({ limit: 100 });
				} catch (error) {
					console.error(`Error fetching messages for channel ${sourceChannelId}:`, error);
					continue; // Skip to next channel if message fetch fails
				}

				const recentMessages = messages.filter((msg) => {
					const messageDate = new Date(msg.createdTimestamp);
					return messageDate >= twoDaysAgo;
				});

				const sortedMessages = Array.from(recentMessages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

				console.log(`Found ${sortedMessages.length} messages to process in channel ${sourceChannelId}`);

				for (const message of sortedMessages) {
					if (!this.messageMap.has(message.id)) {
						try {
							await this.forwardMessage(message);
							// Add delay between processing each message
							await new Promise((resolve) => setTimeout(resolve, 1500));
						} catch (error) {
							console.error(`Error forwarding message ${message.id}:`, error);
							continue; // Skip to next message if forwarding fails
						}
					}
				}

				console.log(`Finished processing channel ${sourceChannelId}`);
			} catch (error) {
				console.error(`Error processing channel ${sourceChannelId}:`, error);
				// Continue to next channel even if current one fails
				continue;
			}
		}

		console.log("Finished processing all channels");
	}

	async start() {
		try {
			// Set up user client event handlers
			this.userClient.on("messageCreate", this.handleUserMessage);
			this.userClient.once("ready", this.handleUserReady);

			// Set up bot client event handlers
			this.botClient.on("messageCreate", this.handleBotMessage);
			this.botClient.once("ready", this.handleBotReady);

			// Login both clients
			await Promise.all([this.userClient.login(this.config.userToken), this.botClient.login(this.config.botToken)]);
		} catch (error) {
			console.error("Error starting the bot:", error);
		}
	}
}

// Create instance and start
const messageForwarder = new MessageForwarder(config);
messageForwarder.start().catch((error) => {
	console.error("Fatal error starting the application:", error);
});

process.on("unhandledRejection", (error) => {
	console.error("Unhandled promise rejection:", error);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught exception:", error);
	// Optionally restart the bot here if needed
});
